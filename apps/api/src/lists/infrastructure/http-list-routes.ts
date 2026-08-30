import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { listContract } from '@yoink/api-contracts';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { ListHandlers } from '../application/create-list-handlers.js';

export type ListRoutesDependencies = {
  listHandlers: ListHandlers;
  authMiddleware: AuthMiddleware;
};

export const registerListRoutes = async (
  app: FastifyInstance,
  deps: ListRoutesDependencies
) => {
  const { listHandlers, authMiddleware } = deps;
  const s = initServer();

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const listRouter = s.router(listContract, {
      list: async ({ request }) => {
        const result = await listHandlers.list({
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (lists) => ({
            status: 200 as const,
            body: { lists },
          }),
          (error) => {
            switch (error.type) {
              case 'STORAGE_ERROR':
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },
    });

    s.registerRouter(listContract, listRouter, authedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};
