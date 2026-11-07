import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
// The handlers live on the public API edge. M5.2 removes this import.
import { createWorkHandlers, type WorkEdgeDependencies } from '../../edges/public-api/v1/work.js';

export type WorkRoutesDependencies = WorkEdgeDependencies & {
  authMiddleware: AuthMiddleware;
};

export const registerWorkRoutes = async (app: FastifyInstance, deps: WorkRoutesDependencies) => {
  const { legacy } = createWorkHandlers(deps);

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const mount = (url: string) => {
      authedApp.route({
        method: 'GET',
        url,
        handler: async (request, reply) => dispatchOrpc(legacy, request, reply),
      });
    };

    mount('/api/work/next-actions');
    mount('/api/work/due');
    mount('/api/work/lists');
  });
};
