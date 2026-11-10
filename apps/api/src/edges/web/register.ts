import { OpenAPIHandler } from '@orpc/openapi/fastify';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import { yoinkOpenApiHandlerOptions } from '../_shared/orpc/handler-options.js';
import { createWebAuthHandlers, type WebAuthDependencies } from './auth.js';
import { WEB_API_PREFIX, dispatchWebApi } from './dispatch.js';
import { createWebInboxHandlers, type WebInboxCaptures } from './inbox.js';
import { webRequestLog } from './log-context.js';
import { createWebSettingsHandlers, type WebSettingsDependencies } from './settings.js';

export type WebApiAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export type WebApiDependencies = {
  captures: WebInboxCaptures;
  combinedAuth: WebApiAuth;
  /**
   * Present when signup services exist. Token list stays on this edge.
   * Public v1 token list stays bearer-only.
   */
  settings?: WebSettingsDependencies;
  /**
   * Present when signup services exist. Login and signup are public.
   * Session, logout, passkeys, and accept-invitation use combined auth.
   */
  auth?: WebAuthDependencies;
};

const mount = (
  app: FastifyInstance,
  handler: OpenAPIHandler<OrpcHttpContext>,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | Array<'GET' | 'POST' | 'PATCH' | 'DELETE'>,
  url: string,
  preHandler?: WebApiAuth
) => {
  app.route({
    method,
    url,
    onRequest: webRequestLog,
    ...(preHandler === undefined ? {} : { preHandler }),
    handler: async (request, reply) => dispatchWebApi(handler, request, reply),
  });
};

const mountWebAuth = async (
  app: FastifyInstance,
  combinedAuth: WebApiAuth,
  auth: WebAuthDependencies
): Promise<void> => {
  const handler = new OpenAPIHandler(createWebAuthHandlers(auth), yoinkOpenApiHandlerOptions);
  const at = (
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    preHandler?: WebApiAuth
  ) => {
    mount(app, handler, method, `${WEB_API_PREFIX}${path}`, preHandler);
  };
  const limited = async (
    max: number,
    timeWindow: string,
    routes: ReadonlyArray<{ method: 'POST'; path: string }>
  ) => {
    if (!auth.rateLimit.enabled) {
      for (const route of routes) {
        at(route.method, route.path);
      }
      return;
    }
    await app.register(async (scope) => {
      await scope.register(rateLimit, {
        max,
        timeWindow,
        keyGenerator: (request) => auth.clientIpOf(request),
      });
      for (const route of routes) {
        mount(scope, handler, route.method, `${WEB_API_PREFIX}${route.path}`);
      }
    });
  };

  at('POST', '/auth/login/options');
  await limited(auth.rateLimit.authLoginMax, auth.rateLimit.authLoginTimeWindow, [
    { method: 'POST', path: '/auth/login/verify' },
  ]);
  await limited(auth.rateLimit.signupMax, auth.rateLimit.signupTimeWindow, [
    { method: 'POST', path: '/auth/signup/options' },
    { method: 'POST', path: '/auth/signup/verify' },
  ]);
  at('POST', '/invitations/validate');
  at('POST', '/auth/logout', combinedAuth);
  at('GET', '/auth/session', combinedAuth);
  at('POST', '/invitations/accept', combinedAuth);
  at('POST', '/auth/passkey/register/options', combinedAuth);
  at('POST', '/auth/passkey/register/verify', combinedAuth);
  at('GET', '/auth/passkey/credentials', combinedAuth);
  at('DELETE', '/auth/passkey/credentials/:credentialId', combinedAuth);
};

/**
 * `/web-api` is already the web edge prefix.
 * Inbox list and create, settings and organizations when `settings` is set,
 * and login, signup, session, passkeys, and join when `auth` is set.
 * Session plus legacy token, the same combined auth as the `/api` alias.
 * Login options, login verify, signup, and invitation validate stay public.
 */
export const registerWebApi = async (
  app: FastifyInstance,
  deps: WebApiDependencies
): Promise<void> => {
  const inbox = new OpenAPIHandler(createWebInboxHandlers(deps), yoinkOpenApiHandlerOptions);
  mount(app, inbox, ['GET', 'POST'], `${WEB_API_PREFIX}/inbox`, deps.combinedAuth);

  if (deps.settings !== undefined) {
    const settings = new OpenAPIHandler(
      createWebSettingsHandlers(deps.settings),
      yoinkOpenApiHandlerOptions
    );
    const at = (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | Array<'GET' | 'POST' | 'PATCH' | 'DELETE'>,
      path: string
    ) => {
      mount(app, settings, method, `${WEB_API_PREFIX}${path}`, deps.combinedAuth);
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
  }

  if (deps.auth !== undefined) {
    await mountWebAuth(app, deps.combinedAuth, deps.auth);
  }
};
