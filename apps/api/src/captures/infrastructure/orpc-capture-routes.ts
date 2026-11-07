import type { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
import type { OrpcHttpContext } from '../../edges/_shared/orpc/http-context.js';
/* eslint-disable boundaries/element-types -- M5.1 removes this import once app.ts mounts the public API edge */
import {
  createCaptureHandlers,
  type CaptureEdgeDependencies,
} from '../../edges/public-api/v1/captures.js';
/* eslint-enable boundaries/element-types */

export type OrpcCaptureRoutesDependencies = CaptureEdgeDependencies & {
  authMiddleware: AuthMiddleware;
};

export const registerOrpcCaptureRoutes = async (
  app: FastifyInstance,
  deps: OrpcCaptureRoutesDependencies,
) => {
  const { legacyCaptures, legacyProject } = createCaptureHandlers(deps);

  const mount = (
    handler: OpenAPIHandler<OrpcHttpContext>,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | Array<'GET' | 'POST' | 'PATCH' | 'DELETE'>,
    url: string,
  ) => {
    app.route({
      method,
      url,
      preHandler: deps.authMiddleware,
      handler: async (request, reply) => dispatchOrpc(handler, request, reply),
    });
  };

  mount(legacyCaptures, ['GET', 'POST'], '/api/captures');
  mount(legacyCaptures, 'POST', '/api/captures/trash/empty');
  mount(legacyCaptures, ['GET', 'PATCH', 'DELETE'], '/api/captures/:id');
  mount(legacyCaptures, 'POST', '/api/captures/:id/trash');
  mount(legacyCaptures, 'POST', '/api/captures/:id/restore');
  mount(legacyCaptures, 'POST', '/api/captures/:id/snooze');
  mount(legacyCaptures, 'POST', '/api/captures/:id/unsnooze');
  mount(legacyCaptures, 'POST', '/api/captures/:id/process');
  mount(legacyProject, 'POST', '/api/captures/:id/process-to-project');
};
