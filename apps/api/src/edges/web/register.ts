import { OpenAPIHandler } from '@orpc/openapi/fastify';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { listedRequestValidationError } from '../_shared/request-validation.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import {
  openApiHandlerOptions,
  yoinkOpenApiHandlerOptions,
} from '../_shared/orpc/handler-options.js';
import { createWebAuthHandlers, type WebAuthDependencies } from './auth.js';
import { WEB_API_PREFIX, dispatchWebApi } from './dispatch.js';
import { createWebHistoryHandlers, type WebHistoryDependencies } from './history.js';
import { createWebInboxHandlers, type WebInboxCaptures } from './inbox.js';
import { webRequestLog } from './log-context.js';
import { createWebProcessHandlers, type WebProcessDependencies } from './process.js';
import { createWebReviewHandlers, type WebReviewDependencies } from './review.js';
import {
  createWebProjectPageHandlers,
  type WebProjectPageDependencies,
} from './project-page.js';
import { projectPageRequestValidationError } from './project-page-errors.js';
import { createWebSettingsHandlers, type WebSettingsDependencies } from './settings.js';
import {
  createWebTasksListsHandlers,
  type WebTasksListsDependencies,
} from './tasks-lists.js';
import { createWebWorkHandlers, type WebWorkDependencies } from './work.js';

export type WebApiAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

type WebMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type WebApiDependencies = {
  captures: WebInboxCaptures;
  combinedAuth: WebApiAuth;
  /**
   * Tasks and lists. Public v1 and the `/api` alias keep the same handlers.
   */
  tasksLists?: WebTasksListsDependencies;
  /**
   * Project page and staged import. Public v1 and the `/api` alias keep the
   * same handlers. Notes stay off this edge.
   */
  projectPage?: WebProjectPageDependencies;
  /**
   * Project history and finished tasks. Public v1 and the `/api` alias keep
   * the same history queries at their current paths.
   */
  history?: WebHistoryDependencies;
  /**
   * Review attention and the done week. Public v1 and the `/api` alias keep
   * the same review queries at their current paths.
   */
  review?: WebReviewDependencies;
  /**
   * Process, trash, and snooze. Public v1 and the `/api` alias keep the same
   * commands. Inbox list and create stay on `captures`.
   */
  process?: WebProcessDependencies;
  /**
   * Work screen and work lists. Public v1 and the `/api` alias keep the
   * same Now, due, and work-list queries. This edge does not sort them.
   */
  work?: WebWorkDependencies;
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
  method: WebMethod | WebMethod[],
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
 * Inbox list and create, tasks and lists when `tasksLists` is set,
 * the project page and staged import when `projectPage` is set,
 * project history and finished tasks when `history` is set,
 * review list and done when `review` is set,
 * process, trash, and snooze when `process` is set,
 * the Work screen and work lists when `work` is set,
 * settings and organizations when `settings` is set,
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

  if (deps.tasksLists !== undefined) {
    const tasksLists = createWebTasksListsHandlers(deps.tasksLists);
    const lists = new OpenAPIHandler(tasksLists.lists, yoinkOpenApiHandlerOptions);
    const tasks = new OpenAPIHandler(
      tasksLists.tasks,
      openApiHandlerOptions(listedRequestValidationError)
    );
    const at = (
      handler: OpenAPIHandler<OrpcHttpContext>,
      method: WebMethod | WebMethod[],
      path: string
    ) => {
      mount(app, handler, method, `${WEB_API_PREFIX}${path}`, deps.combinedAuth);
    };
    at(lists, ['GET', 'POST'], '/lists');
    at(lists, ['PATCH', 'DELETE'], '/lists/:id');
    at(lists, 'GET', '/lists/:id/tasks');
    at(lists, 'PUT', '/lists/:id/tasks/order');
    at(lists, 'GET', '/unlisted/tasks');
    at(lists, 'PUT', '/unlisted/tasks/order');
    at(tasks, ['GET', 'POST'], '/tasks');
    at(tasks, ['PATCH', 'DELETE'], '/tasks/:id');
    at(tasks, 'POST', '/tasks/:id/complete');
    at(tasks, 'POST', '/tasks/:id/uncomplete');
  }

  if (deps.projectPage !== undefined) {
    const projects = new OpenAPIHandler(
      createWebProjectPageHandlers(deps.projectPage),
      openApiHandlerOptions(projectPageRequestValidationError)
    );
    const at = (method: WebMethod | WebMethod[], path: string) => {
      mount(app, projects, method, `${WEB_API_PREFIX}${path}`, deps.combinedAuth);
    };
    at('GET', '/projects/imports');
    at('GET', '/projects/imports/:id');
    at('POST', '/projects/imports/:id/apply');
    at('POST', '/projects/imports/:id/discard');
    at(['GET', 'PATCH'], '/projects/:id');
    at('GET', '/projects/:id/tasks');
    at('PUT', '/projects/:id/status');
    at('PUT', '/projects/:id/next-action');
    at('POST', '/projects/:id/confirm');
    at('POST', '/projects/:id/decline');
    at('POST', '/projects/:id/restore');
  }

  if (deps.history !== undefined) {
    const history = new OpenAPIHandler(
      createWebHistoryHandlers(deps.history),
      yoinkOpenApiHandlerOptions
    );
    const at = (method: WebMethod | WebMethod[], path: string) => {
      mount(app, history, method, `${WEB_API_PREFIX}${path}`, deps.combinedAuth);
    };
    at('GET', '/projects/:id/history');
    at('GET', '/projects/:id/finished');
  }

  if (deps.review !== undefined) {
    const review = new OpenAPIHandler(
      createWebReviewHandlers(deps.review),
      openApiHandlerOptions(listedRequestValidationError)
    );
    const at = (path: string) => {
      mount(app, review, 'GET', `${WEB_API_PREFIX}${path}`, deps.combinedAuth);
    };
    at('/review/done');
    at('/review');
  }

  if (deps.process !== undefined) {
    const processRouter = createWebProcessHandlers(deps.process);
    const commands = new OpenAPIHandler(processRouter, yoinkOpenApiHandlerOptions);
    const project = new OpenAPIHandler(
      processRouter,
      openApiHandlerOptions(projectPageRequestValidationError)
    );
    const at = (
      handler: OpenAPIHandler<OrpcHttpContext>,
      method: WebMethod | WebMethod[],
      path: string
    ) => {
      mount(app, handler, method, `${WEB_API_PREFIX}${path}`, deps.combinedAuth);
    };
    at(commands, 'POST', '/captures/trash/empty');
    at(commands, 'POST', '/captures/:id/trash');
    at(commands, 'POST', '/captures/:id/restore');
    at(commands, 'POST', '/captures/:id/snooze');
    at(commands, 'POST', '/captures/:id/unsnooze');
    at(commands, 'DELETE', '/captures/:id');
    at(commands, 'POST', '/captures/:id/process');
    at(project, 'POST', '/captures/:id/process-to-project');
  }

  if (deps.work !== undefined) {
    const work = new OpenAPIHandler(
      createWebWorkHandlers(deps.work),
      openApiHandlerOptions(listedRequestValidationError)
    );
    const at = (method: WebMethod | WebMethod[], path: string) => {
      mount(app, work, method, `${WEB_API_PREFIX}${path}`, deps.combinedAuth);
    };
    at('GET', '/work/lists');
    at('GET', '/work');
  }

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
