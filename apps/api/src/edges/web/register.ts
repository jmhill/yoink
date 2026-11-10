import { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import { yoinkOpenApiHandlerOptions } from '../_shared/orpc/handler-options.js';
import { WEB_API_PREFIX, dispatchWebApi } from './dispatch.js';
import { createWebInboxHandlers, type WebInboxCaptures } from './inbox.js';
import { webRequestLog } from './log-context.js';
import { createWebSettingsHandlers, type WebSettingsDependencies } from './settings.js';

export type WebApiAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export type WebApiDependencies = {
  captures: WebInboxCaptures;
  combinedAuth: WebApiAuth;
  /**
   * Present when signup services exist. Passkeys, session, and join stay
   * on the `/api` alias.
   */
  settings?: WebSettingsDependencies;
};

const mount = (
  app: FastifyInstance,
  deps: WebApiDependencies,
  handler: OpenAPIHandler<OrpcHttpContext>,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | Array<'GET' | 'POST' | 'PATCH' | 'DELETE'>,
  url: string
) => {
  app.route({
    method,
    url,
    onRequest: webRequestLog,
    preHandler: deps.combinedAuth,
    handler: async (request, reply) => dispatchWebApi(handler, request, reply),
  });
};

/**
 * `/web-api` is already the web edge prefix.
 * Inbox list and create, plus settings and organizations when `settings` is set.
 * Session plus legacy token, the same combined auth as the `/api` alias.
 */
export const registerWebApi = async (
  app: FastifyInstance,
  deps: WebApiDependencies
): Promise<void> => {
  const inbox = new OpenAPIHandler(createWebInboxHandlers(deps), yoinkOpenApiHandlerOptions);
  mount(app, deps, inbox, ['GET', 'POST'], `${WEB_API_PREFIX}/inbox`);

  if (deps.settings === undefined) {
    return;
  }
  const settings = new OpenAPIHandler(
    createWebSettingsHandlers(deps.settings),
    yoinkOpenApiHandlerOptions
  );
  const at = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | Array<'GET' | 'POST' | 'PATCH' | 'DELETE'>,
    path: string
  ) => {
    mount(app, deps, settings, method, `${WEB_API_PREFIX}${path}`);
  };
  at('POST', '/organizations/switch');
  at('POST', '/organizations/:organizationId/leave');
  at('POST', '/organizations/:organizationId/owner/transfer');
  at('GET', '/organizations/:organizationId/members');
  at('PATCH', '/organizations/:organizationId/members/:userId/role');
  at('DELETE', '/organizations/:organizationId/members/:userId');
  at('POST', '/organizations/:organizationId/agents');
  at('POST', '/organizations/:organizationId/members/:userId/token');
  at('POST', '/invitations');
  at('GET', '/organizations/:organizationId/invitations');
  at('DELETE', '/invitations/:invitationId');
  at(['GET', 'POST'], '/auth/tokens');
  at('DELETE', '/auth/tokens/:tokenId');
};
