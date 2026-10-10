import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { projectContract } from '@yoink/api-contracts';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { ProjectHandlers } from '../application/create-project-handlers.js';
import {
  invalidCursorHttp,
  toProjectListBody,
} from '../../listing/infrastructure/http-listed-page.js';

export type ProjectRoutesDependencies = {
  projectHandlers: ProjectHandlers;
  authMiddleware: AuthMiddleware;
};

export const registerProjectRoutes = async (
  app: FastifyInstance,
  deps: ProjectRoutesDependencies
) => {
  const { projectHandlers, authMiddleware } = deps;
  const s = initServer();

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const projectRouter = s.router(projectContract, {
      list: async ({ query, request }) => {
        const result = await projectHandlers.list({
          organizationId: request.authContext.organizationId,
          limit: query.limit,
          cursor: query.cursor,
        });

        return result.match(
          (page) => ({
            status: 200 as const,
            body: toProjectListBody(page),
          }),
          (error) => {
            switch (error.type) {
              case 'INVALID_CURSOR':
                return invalidCursorHttp(error);
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      create: async ({ body, request }) => {
        const result = await projectHandlers.create({
          name: body.name,
          objective: body.objective,
          organizationId: request.authContext.organizationId,
          createdById: request.authContext.userId,
          actor: request.authContext.actor,
        });

        return result.match(
          ({ view }) => ({
            status: 201 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'INVALID_PROJECT_NAME':
                return {
                  status: 400 as const,
                  body: { message: error.message },
                };
              case 'DUPLICATE_PROJECT_NAME':
                return {
                  status: 409 as const,
                  body: { message: error.message },
                };
              case 'PROJECT_CREATE_REQUIRES_PERSON':
                return {
                  status: 403 as const,
                  body: { message: error.message },
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
        const result = await projectHandlers.get({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (view) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: error.message },
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
        const result = await projectHandlers.update({
          id: params.id,
          organizationId: request.authContext.organizationId,
          name: body.name,
          objective: body.objective,
          actor: request.authContext.actor,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'INVALID_PROJECT_NAME':
                return {
                  status: 400 as const,
                  body: { message: error.message },
                };
              case 'DUPLICATE_PROJECT_NAME':
                return {
                  status: 409 as const,
                  body: { message: error.message },
                };
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: error.message },
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

    s.registerRouter(projectContract, projectRouter, authedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};
