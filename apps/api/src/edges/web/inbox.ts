import { implement, ORPCError } from '@orpc/server';
import { webInboxContract } from '@yoink/api-contracts/web';
import type { PrincipalKind } from '../../kernel/auth-context.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import { yoinkServerError } from '../_shared/orpc/yoink-http-error.js';
import { toCaptureListBody } from '../_shared/http-listed-page.js';
import type {
  Captures,
  CreateCaptureError,
  ListCapturesError,
} from '../../modules/captures/index.js';

/**
 * Inbox list and create. The rest of `Captures` stays off this port.
 */
export type WebInboxCaptures = {
  commands: {
    createCapture: Captures['commands']['createCapture'];
  };
  queries: {
    listCaptures: Captures['queries']['listCaptures'];
  };
};

const mapAgentCaptureRefusal = (principalKind: PrincipalKind) => {
  switch (principalKind) {
    case 'agent':
      return new ORPCError('FORBIDDEN', {
        message: 'Agents cannot create captures',
      });
    case 'human':
      return undefined;
    default: {
      const _never: never = principalKind;
      void _never;
      return undefined;
    }
  }
};

const mapCreateCaptureError = (error: CreateCaptureError) => {
  switch (error.type) {
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to create capture', error);
  }
};

const mapListCapturesError = (error: ListCapturesError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return new ORPCError('INVALID_CURSOR', {
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list captures', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list captures', _never);
    }
  }
};

export const createWebInboxHandlers = (deps: { captures: WebInboxCaptures }) => {
  const web = implement(webInboxContract).$context<OrpcHttpContext>();

  return web.router({
    create: web.create.handler(async ({ input, context }) => {
      const refusal = mapAgentCaptureRefusal(context.request.authContext.principalKind);
      if (refusal) throw refusal;
      const result = await deps.captures.commands.createCapture({
        content: input.content,
        title: input.title,
        sourceUrl: input.sourceUrl,
        sourceApp: input.sourceApp,
        organizationId: context.request.authContext.organizationId,
        createdById: context.request.authContext.userId,
        actor: context.request.authContext.actor,
      });
      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapCreateCaptureError(error);
        }
      );
    }),
    list: web.list.handler(async ({ input, context }) => {
      const result = await deps.captures.queries.listCaptures({
        organizationId: context.request.authContext.organizationId,
        status: input.status,
        snoozed: input.snoozed,
        limit: input.limit,
        cursor: input.cursor,
      });
      return result.match(
        (page) => toCaptureListBody(page),
        (error) => {
          throw mapListCapturesError(error);
        }
      );
    }),
  });
};
