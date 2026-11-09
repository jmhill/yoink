import { implement, ORPCError } from '@orpc/server';
import { extensionApiV1Contract } from '@yoink/api-contracts/extension/v1';
import type { PrincipalKind } from '../../../kernel/auth-context.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import { yoinkServerError } from '../../_shared/orpc/yoink-http-error.js';
import { toCaptureListBody } from '../../_shared/http-listed-page.js';
import type {
  Captures,
  CreateCaptureError,
  ListCapturesError,
} from '../../../modules/captures/index.js';

/**
 * The extension edge calls only the capture procedures the extension uses.
 * The rest of `Captures` stays off this port.
 */
export type ExtensionCaptures = {
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

export const createExtensionCaptureHandlers = (deps: { captures: ExtensionCaptures }) => {
  const v1 = implement(extensionApiV1Contract).$context<OrpcHttpContext>();

  return v1.router({
    create: v1.create.handler(async ({ input, context }) => {
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
    list: v1.list.handler(async ({ input, context }) => {
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
