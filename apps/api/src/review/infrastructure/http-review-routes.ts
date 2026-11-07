import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
// The handlers live on the public API edge. M5.10 removes this import.
// eslint-disable-next-line boundaries/element-types
import { createReviewHandlers, type ReviewEdgeDependencies } from '../../edges/public-api/v1/review.js';

export type ReviewRoutesDependencies = ReviewEdgeDependencies & {
  authMiddleware: AuthMiddleware;
};

export const registerReviewRoutes = async (app: FastifyInstance, deps: ReviewRoutesDependencies) => {
  const { legacy } = createReviewHandlers(deps);

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const mount = (url: string) => {
      authedApp.route({
        method: 'GET',
        url,
        handler: async (request, reply) => dispatchOrpc(legacy, request, reply),
      });
    };

    mount('/api/review/done');
    mount('/api/review');
  });
};
