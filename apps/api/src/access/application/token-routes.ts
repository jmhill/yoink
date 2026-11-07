import { oc } from '@orpc/contract';
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
import type { CreateTokenError, RevokeTokenError } from '../domain/token-errors.js';
import { accessHttpError, accessStorageError } from './access-http-errors.js';

export type TokenRoutesDependencies = {
  tokenHandlers: TokenHandlers;
  sessionService: SessionService;
  tokenService: TokenService;
  sessionCookieName: string;
  applyAuthenticatedRateLimit?: AuthenticatedRateLimitConsume;
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

const tokenMutationHandler = (deps: TokenRoutesDependencies) => {
  const { tokenHandlers } = deps;
  const mutations = oc.router({
    create: tokenOrpcContract.create,
    delete: tokenOrpcContract.delete,
  });
  const tokens = implement(mutations).$context<OrpcHttpContext>();
  const tokenRouter = tokens.router({
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

  return new OpenAPIHandler(tokenRouter, yoinkOpenApiHandlerOptions);
};

const protectedTokenAuth = (deps: TokenRoutesDependencies) => {
  const authMiddlewareDeps: CombinedAuthMiddlewareDependencies = {
    tokenService: deps.tokenService,
    sessionService: deps.sessionService,
    sessionCookieName: deps.sessionCookieName,
  };
  const resolvedAuth = createCombinedAuthMiddleware(authMiddlewareDeps);
  return deps.applyAuthenticatedRateLimit === undefined
    ? resolvedAuth
    : withAuthenticatedRateLimit(resolvedAuth, deps.applyAuthenticatedRateLimit);
};

/**
 * Client-only token writes. No versioned path and no alias headers.
 * `GET /api/auth/tokens` is owned by the public API edge.
 */
export const registerTokenMutationRoutes = async (
  app: FastifyInstance,
  deps: TokenRoutesDependencies,
) => {
  const handler = tokenMutationHandler(deps);
  const authMiddleware = protectedTokenAuth(deps);
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authMiddleware);
    protectedApp.route({
      method: 'POST',
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
