import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { workContract } from '@yoink/api-contracts';
import type { AuthMiddleware } from '../../access/application/index.js';
import {
  invalidCursorHttp,
  toTaskListBody,
  toWorkListsBody,
  toWorkNextActionsBody,
} from '../../listing/infrastructure/http-listed-page.js';
import { listedRequestValidationError } from '../../shared/request-validation.js';
import type { WorkHandlers } from '../application/create-work-handlers.js';

export type WorkRoutesDependencies = {
  workHandlers: WorkHandlers;
  authMiddleware: AuthMiddleware;
};

export const registerWorkRoutes = async (
  app: FastifyInstance,
  deps: WorkRoutesDependencies
) => {
  const { workHandlers, authMiddleware } = deps;
  const s = initServer();

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const workRouter = s.router(workContract, {
      listNextActions: async ({ query, request }) => {
        const result = await workHandlers.listNextActions({
          organizationId: request.authContext.organizationId,
          callerId: request.authContext.userId,
          owner: query.owner,
          limit: query.limit,
          cursor: query.cursor,
        });
        return result.match(
          (page) => ({
            status: 200 as const,
            body: toWorkNextActionsBody(page),
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

      listDue: async ({ query, request }) => {
        const result = await workHandlers.listDue({
          organizationId: request.authContext.organizationId,
          callerId: request.authContext.userId,
          owner: query.owner,
          limit: query.limit,
          cursor: query.cursor,
          timeZone: query.timeZone,
        });
        return result.match(
          (page) => ({
            status: 200 as const,
            body: toTaskListBody(page),
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

      listLists: async ({ query, request }) => {
        const result = await workHandlers.listLists({
          organizationId: request.authContext.organizationId,
          limit: query.limit,
          cursor: query.cursor,
        });
        return result.match(
          (page) => ({
            status: 200 as const,
            body: toWorkListsBody(page),
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
    });

    s.registerRouter(workContract, workRouter, authedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send(listedRequestValidationError(err));
      },
    });
  });
};
