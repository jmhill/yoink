import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
// The handlers live on the public API edge. M5.3 removes this import.
import { createProjectHandlers, type ProjectEdgeDependencies } from '../../edges/public-api/v1/projects.js';

export type ProjectRoutesDependencies = ProjectEdgeDependencies & {
  authMiddleware: AuthMiddleware;
};

type RouteMethod = 'GET' | 'POST' | 'PATCH' | 'PUT';

export const registerProjectRoutes = async (app: FastifyInstance, deps: ProjectRoutesDependencies) => {
  const { legacy } = createProjectHandlers(deps);
  const { authMiddleware } = deps;

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const mount = (method: RouteMethod | readonly RouteMethod[], url: string) => {
      authedApp.route({
        method: typeof method === 'string' ? method : [...method],
        url,
        handler: async (request, reply) => dispatchOrpc(legacy, request, reply),
      });
    };

    mount(['GET', 'POST'], '/api/projects');
    mount(['GET', 'POST'], '/api/projects/imports');
    mount('GET', '/api/projects/imports/:id');
    mount('POST', '/api/projects/imports/:id/apply');
    mount('POST', '/api/projects/imports/:id/discard');
    mount(['GET', 'PATCH'], '/api/projects/:id');
    mount('GET', '/api/projects/:id/tasks');
    mount('GET', '/api/projects/:id/history');
    mount('PUT', '/api/projects/:id/status');
    mount('POST', '/api/projects/:id/confirm');
    mount('POST', '/api/projects/:id/decline');
    mount('POST', '/api/projects/:id/restore');
    mount('PUT', '/api/projects/:id/next-action');
  });
};
