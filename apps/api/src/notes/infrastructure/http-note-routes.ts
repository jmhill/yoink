import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { noteContract } from '@yoink/api-contracts';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { NoteHandlers } from '../application/create-note-handlers.js';
import { invalidCursorHttp, toNoteListBody } from '../../listing/infrastructure/http-listed-page.js';
import { noteRequestValidationError } from './note-http-errors.js';

export type NoteRoutesDependencies = {
  noteHandlers: NoteHandlers;
  authMiddleware: AuthMiddleware;
};

const noteErrorBody = (error: { type: string; message: string }) => ({
  message: error.message,
  code: error.type,
});

export const registerNoteRoutes = async (
  app: FastifyInstance,
  deps: NoteRoutesDependencies
) => {
  const { noteHandlers, authMiddleware } = deps;
  const s = initServer();

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const noteRouter = s.router(noteContract, {
      list: async ({ params, query, request }) => {
        const result = await noteHandlers.list({
          projectId: params.projectId,
          organizationId: request.authContext.organizationId,
          limit: query.limit,
          cursor: query.cursor,
        });
        return result.match(
          (page) => ({
            status: 200 as const,
            body: toNoteListBody(page),
          }),
          (error) => {
            switch (error.type) {
              case 'INVALID_CURSOR':
                return invalidCursorHttp(error);
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: noteErrorBody(error),
                };
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      get: async ({ params, request }) => {
        const result = await noteHandlers.get({
          noteId: params.noteId,
          projectId: params.projectId,
          organizationId: request.authContext.organizationId,
        });
        return result.match(
          (note) => ({
            status: 200 as const,
            body: note,
          }),
          (error) => {
            switch (error.type) {
              case 'NOTE_NOT_FOUND':
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: noteErrorBody(error),
                };
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      create: async ({ params, body, request }) => {
        const result = await noteHandlers.create({
          projectId: params.projectId,
          organizationId: request.authContext.organizationId,
          title: body.title,
          body: body.body,
          actor: request.authContext.actor,
        });
        return result.match(
          ({ view }) => ({
            status: 201 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'NOTE_TITLE_BLANK':
              case 'NOTE_TITLE_TOO_LONG':
              case 'NOTE_BODY_TOO_LONG':
                return {
                  status: 400 as const,
                  body: noteErrorBody(error),
                };
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: noteErrorBody(error),
                };
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      update: async ({ params, body, request }) => {
        const result = await noteHandlers.update({
          noteId: params.noteId,
          projectId: params.projectId,
          organizationId: request.authContext.organizationId,
          title: body.title,
          body: body.body,
          expectedVersion: body.expectedVersion,
          actor: request.authContext.actor,
        });
        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'NOTE_TITLE_BLANK':
              case 'NOTE_TITLE_TOO_LONG':
              case 'NOTE_BODY_TOO_LONG':
              case 'NOTE_UNCHANGED':
                return {
                  status: 400 as const,
                  body: noteErrorBody(error),
                };
              case 'NOTE_NOT_FOUND':
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: noteErrorBody(error),
                };
              case 'STALE_NOTE':
                return {
                  status: 409 as const,
                  body: {
                    message: error.message,
                    code: 'STALE_NOTE' as const,
                    currentVersion: error.currentVersion,
                    updatedAt: error.updatedAt,
                    updatedById: error.updatedById,
                    updatedByName: error.updatedByName,
                  },
                };
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      delete: async ({ params, request }) => {
        const result = await noteHandlers.delete({
          noteId: params.noteId,
          projectId: params.projectId,
          organizationId: request.authContext.organizationId,
          actor: request.authContext.actor,
        });
        return result.match(
          () => ({
            status: 204 as const,
            body: undefined,
          }),
          (error) => {
            switch (error.type) {
              case 'NOTE_NOT_FOUND':
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: noteErrorBody(error),
                };
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },
    });

    s.registerRouter(noteContract, noteRouter, authedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send(noteRequestValidationError(err));
      },
    });
  });
};
