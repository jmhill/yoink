import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
// The handlers live on the public API edge. M5.3 removes this import.
// eslint-disable-next-line boundaries/element-types
import { createTaskHandlers, type TaskEdgeDependencies } from '../../edges/public-api/v1/tasks.js';

export type TaskRoutesDependencies = TaskEdgeDependencies & {
  authMiddleware: AuthMiddleware;
};

type TaskHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export const registerTaskRoutes = async (app: FastifyInstance, deps: TaskRoutesDependencies) => {
  const { legacy } = createTaskHandlers(deps);

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const mount = (method: TaskHttpMethod | TaskHttpMethod[], url: string) => {
      authedApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(legacy, request, reply),
      });
    };

    mount(['GET', 'POST'], '/api/tasks');
    mount('POST', '/api/tasks/:id/complete');
    mount('POST', '/api/tasks/:id/uncomplete');
    mount('POST', '/api/tasks/:id/pin');
    mount('POST', '/api/tasks/:id/unpin');
    mount('GET', '/api/tasks/:id/history');
    mount(['GET', 'PATCH', 'DELETE'], '/api/tasks/:id');
  });
};
