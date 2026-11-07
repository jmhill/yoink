import type { FastifyInstance } from 'fastify';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { tokenOrpcContract } from '@yoink/api-contracts/orpc';
import type { SessionService } from '../domain/session-service.js';
import type { TokenService } from '../domain/token-service.js';
import type { TokenHandlers } from './create-token-handlers.js';
import {
  createCombinedAuthMiddleware,
  type CombinedAuthMiddlewareDependencies,
} from './combined-auth-middleware.js';
import {
  withAuthenticatedRateLimit,
  type AuthenticatedRateLimitConsume,
} from './with-authenticated-rate-limit.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
import { yoinkOpenApiHandlerOptions } from '../../edges/_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../edges/_shared/orpc/http-context.js';
import type { CreateTokenError, ListTokensError, RevokeTokenError } from '../domain/token-errors.js';
import { accessHttpError, accessStorageError } from './access-http-errors.js';

export type TokenRoutesDependencies = {
  tokenHandlers: TokenHandlers;
  sessionService: SessionService;
  tokenService: TokenService;
  sessionCookieName: string;
  applyAuthenticatedRateLimit?: AuthenticatedRateLimitConsume;
};

const listTokensFailure = (error: ListTokensError) => {
  switch (error.type) {
    case 'TOKEN_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to list tokens');
  }
};

const createTokenFailure = (error: CreateTokenError) => {
  switch (error.type) {
    case 'INVALID_TOKEN_NAME':
      return accessHttpError({ code: 'BAD_REQUEST', message: error.message });
    case 'BOT_CANNOT_MANAGE_TOKENS':
      return accessHttpError({ code: 'FORBIDDEN', message: error.message });
    case 'TOKEN_OWNERSHIP_ERROR':
      return accessHttpError({ code: 'FORBIDDEN', message: 'You do not own this token' });
    case 'TOKEN_LIMIT_REACHED':
      return accessHttpError({
        code: 'CONFLICT',
        message: `You can have at most ${error.limit} API tokens per organization`,
      });
    case 'TOKEN_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to create token');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to create token');
    }
  }
};

const deleteTokenFailure = (error: RevokeTokenError) => {
  switch (error.type) {
    case 'BOT_CANNOT_MANAGE_TOKENS':
      return accessHttpError({ code: 'FORBIDDEN', message: error.message });
    case 'TOKEN_OWNERSHIP_ERROR':
      return accessHttpError({ code: 'FORBIDDEN', message: 'You do not own this token' });
    case 'USER_TOKEN_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'Token not found' });
    case 'TOKEN_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to delete token');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to delete token');
    }
  }
};

export const registerTokenRoutes = async (
  app: FastifyInstance,
  deps: TokenRoutesDependencies
) => {
  const { tokenHandlers, sessionService, tokenService, sessionCookieName } = deps;

  const authMiddlewareDeps: CombinedAuthMiddlewareDependencies = {
    tokenService,
    sessionService,
    sessionCookieName,
  };

  const resolvedAuth = createCombinedAuthMiddleware(authMiddlewareDeps);
  const authMiddleware =
    deps.applyAuthenticatedRateLimit === undefined
      ? resolvedAuth
      : withAuthenticatedRateLimit(resolvedAuth, deps.applyAuthenticatedRateLimit);

  const tokens = implement(tokenOrpcContract).$context<OrpcHttpContext>();
  const tokenRouter = tokens.router({
    list: tokens.list.handler(async ({ context }) => {
      const { userId, organizationId, actor } = context.request.authContext;
      const result = await tokenHandlers.list({ actor, userId, organizationId });
      return result.match(
        (page) => page,
        (error) => {
          throw listTokensFailure(error);
        }
      );
    }),
    create: tokens.create.handler(async ({ input, context }) => {
      const { userId, organizationId, actor } = context.request.authContext;
      const result = await tokenHandlers.create({
        actor,
        userId,
        organizationId,
        name: input.name,
      });
      return result.match(
        ({ token, rawToken }) => ({ token, rawToken }),
        (error) => {
          throw createTokenFailure(error);
        }
      );
    }),
    delete: tokens.delete.handler(async ({ input, context }) => {
      const { userId, organizationId, actor } = context.request.authContext;
      const result = await tokenHandlers.revoke({
        actor,
        tokenId: input.tokenId,
        userId,
        organizationId,
      });
      return result.match(
        () => ({ success: true as const }),
        (error) => {
          throw deleteTokenFailure(error);
        }
      );
    }),
  });

  const handler = new OpenAPIHandler(tokenRouter, yoinkOpenApiHandlerOptions);

  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authMiddleware);

    protectedApp.route({
      method: ['GET', 'POST'],
      url: '/api/auth/tokens',
      handler: async (request, reply) => dispatchOrpc(handler, request, reply),
    });
    protectedApp.route({
      method: 'DELETE',
      url: '/api/auth/tokens/:tokenId',
      handler: async (request, reply) => dispatchOrpc(handler, request, reply),
    });
  });
};
