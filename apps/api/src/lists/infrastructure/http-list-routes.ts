import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
// The handlers live on the public API edge. M5.3 removes this import.
// eslint-disable-next-line boundaries/element-types
import { createListHandlers, type ListEdgeDependencies } from '../../edges/public-api/v1/lists.js';

export type ListRoutesDependencies = ListEdgeDependencies & {
  authMiddleware: AuthMiddleware;
};

type ListHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export const registerListRoutes = async (app: FastifyInstance, deps: ListRoutesDependencies) => {
  const { legacy } = createListHandlers(deps);

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const mount = (method: ListHttpMethod | ListHttpMethod[], url: string) => {
      authedApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(legacy, request, reply),
      });
    };

    mount(['GET', 'POST'], '/api/lists');
    mount('GET', '/api/unlisted/tasks');
    mount('PUT', '/api/unlisted/tasks/order');
    mount('GET', '/api/lists/:id/tasks');
    mount('PUT', '/api/lists/:id/tasks/order');
    mount(['PATCH', 'DELETE'], '/api/lists/:id');
  });
};
