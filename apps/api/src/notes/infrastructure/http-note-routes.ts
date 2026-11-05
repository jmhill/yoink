import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { noteOrpcContract } from '@yoink/api-contracts/orpc';
import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import { toNoteListBody } from '../../listing/infrastructure/http-listed-page.js';
import { dispatchOrpc } from '../../shared/orpc/dispatch.js';
import { openApiHandlerOptions } from '../../shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../shared/orpc/http-context.js';
import type { NoteHandlers } from '../application/create-note-handlers.js';
import { noteRequestValidationError } from './note-http-errors.js';
import {
  mapCreateNoteError,
  mapDeleteNoteError,
  mapGetNoteError,
  mapImportNoteError,
  mapListNotesChangedError,
  mapListNotesError,
  mapUpdateNoteError,
} from './orpc-note-errors.js';

export type NoteRoutesDependencies = {
  noteHandlers: NoteHandlers;
  authMiddleware: AuthMiddleware;
};

type NoteHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export const registerNoteRoutes = async (
  app: FastifyInstance,
  deps: NoteRoutesDependencies
) => {
  const notes = implement(noteOrpcContract).$context<OrpcHttpContext>();
  const router = notes.router({
    list: notes.list.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.list({
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });

      return result.match(
        (page) => toNoteListBody(page),
        (error) => {
          throw mapListNotesError(error);
        }
      );
    }),
    get: notes.get.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.get({
        noteId: input.noteId,
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
      });

      return result.match(
        (note) => note,
        (error) => {
          throw mapGetNoteError(error);
        }
      );
    }),
    create: notes.create.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.create({
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
        title: input.title,
        body: input.body,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapCreateNoteError(error);
        }
      );
    }),
    update: notes.update.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.update({
        noteId: input.noteId,
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
        title: input.title,
        body: input.body,
        expectedVersion: input.expectedVersion,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapUpdateNoteError(error);
        }
      );
    }),
    listChanged: notes.listChanged.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.listChanged({
        organizationId: context.request.authContext.organizationId,
        since: input.since,
        limit: input.limit,
        cursor: input.cursor,
      });

      return result.match(
        (page) => page,
        (error) => {
          throw mapListNotesChangedError(error);
        }
      );
    }),
    importFromObsidian: notes.importFromObsidian.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.importFromObsidian({
        organizationId: context.request.authContext.organizationId,
        projectId: input.projectId,
        noteId: input.noteId,
        title: input.title,
        body: input.body,
        baseVersion: input.baseVersion,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view, created }) => ({
          status: created ? 201 : 200,
          body: view,
        }),
        (error) => {
          throw mapImportNoteError(error);
        }
      );
    }),
    delete: notes.delete.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.delete({
        noteId: input.noteId,
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        () => undefined,
        (error) => {
          throw mapDeleteNoteError(error);
        }
      );
    }),
  });

  const handler = new OpenAPIHandler(router, openApiHandlerOptions(noteRequestValidationError));

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const mount = (method: NoteHttpMethod | NoteHttpMethod[], url: string) => {
      authedApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount('GET', '/api/notes/changed');
    mount('POST', '/api/notes/import');
    mount(['GET', 'POST'], '/api/projects/:projectId/notes');
    mount(['GET', 'PATCH', 'DELETE'], '/api/projects/:projectId/notes/:noteId');
  });
};
