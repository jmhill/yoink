import type { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { FastifyInstance } from 'fastify';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import { dispatchPublicApi, type PublicApiPrefix } from './dispatch.js';
import { bindTokenId, publicApiRequestLog, type PublicApiAuth } from './log-context.js';

export type PublicApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type PublicApiRoute = {
  method: PublicApiMethod | readonly PublicApiMethod[];
  path: `/${string}`;
};

const mountOne = (
  app: FastifyInstance,
  handler: OpenAPIHandler<OrpcHttpContext>,
  route: PublicApiRoute,
  prefix: PublicApiPrefix,
  auth: PublicApiAuth,
  alias: boolean,
) => {
  app.route({
    method: typeof route.method === 'string' ? route.method : [...route.method],
    url: `${prefix}${route.path}`,
    onRequest: publicApiRequestLog(alias),
    preHandler: [auth, bindTokenId],
    handler: async (request, reply) => dispatchPublicApi(handler, request, reply, prefix),
  });
};

/** Token-only `/api/v1`, then the same routes at `/api` with alias headers. */
export const mountPublicApiRoutes = (
  app: FastifyInstance,
  options: {
    handler: OpenAPIHandler<OrpcHttpContext>;
    routes: readonly PublicApiRoute[];
    tokenAuth: PublicApiAuth;
    aliasAuth: PublicApiAuth;
  },
): void => {
  for (const route of options.routes) {
    mountOne(app, options.handler, route, '/api/v1', options.tokenAuth, false);
    mountOne(app, options.handler, route, '/api', options.aliasAuth, true);
  }
};
