import { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { yoinkOpenApiHandlerOptions } from '../_shared/orpc/handler-options.js';
import { WEB_API_PREFIX, dispatchWebApi } from './dispatch.js';
import { createWebInboxHandlers, type WebInboxCaptures } from './inbox.js';
import { webRequestLog } from './log-context.js';

export type WebApiAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export type WebApiDependencies = {
  captures: WebInboxCaptures;
  combinedAuth: WebApiAuth;
};

/**
 * Inbox list and create at `/web-api/inbox`.
 * Session plus legacy token, the same combined auth as the `/api` alias.
 * The rest of the web app stays on that alias.
 */
export const registerWebApi = async (
  app: FastifyInstance,
  deps: WebApiDependencies
): Promise<void> => {
  const handler = new OpenAPIHandler(createWebInboxHandlers(deps), yoinkOpenApiHandlerOptions);
  app.route({
    method: ['GET', 'POST'],
    url: `${WEB_API_PREFIX}/inbox`,
    onRequest: webRequestLog,
    preHandler: deps.combinedAuth,
    handler: async (request, reply) => dispatchWebApi(handler, request, reply),
  });
};
