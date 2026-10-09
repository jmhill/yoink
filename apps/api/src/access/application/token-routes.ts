import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { tokenContract } from '@yoink/api-contracts';
import type { SessionService } from '../domain/session-service.js';
import type { TokenService } from '../domain/token-service.js';
import type { TokenHandlers } from './create-token-handlers.js';
import {
  createCombinedAuthMiddleware,
  type CombinedAuthMiddlewareDependencies,
} from './combined-auth-middleware.js';

export type TokenRoutesDependencies = {
  tokenHandlers: TokenHandlers;
  sessionService: SessionService;
  tokenService?: TokenService;
  sessionCookieName: string;
};

export const registerTokenRoutes = async (
  app: FastifyInstance,
  deps: TokenRoutesDependencies
) => {
  const { tokenHandlers, sessionService, tokenService, sessionCookieName } = deps;
  const s = initServer();

  const authMiddlewareDeps: CombinedAuthMiddlewareDependencies = tokenService
    ? { tokenService, sessionService, sessionCookieName }
    : {
        tokenService: {
          validateToken: () =>
            Promise.resolve({
              isErr: () => true,
              isOk: () => false,
              error: { type: 'INVALID_TOKEN_FORMAT' as const },
            }),
        } as unknown as TokenService,
        sessionService,
        sessionCookieName,
      };

  const authMiddleware = createCombinedAuthMiddleware(authMiddlewareDeps);

  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authMiddleware);

    const router = s.router(tokenContract, {
      list: async ({ request }) => {
        const { userId, organizationId } = request.authContext;
        const result = await tokenHandlers.list({ userId, organizationId });

        return result.match(
          (page) => ({
            status: 200 as const,
            body: page,
          }),
          (error) => {
            request.log.error({ error }, 'Failed to list tokens');
            return {
              status: 500 as const,
              body: { message: 'Failed to list tokens' },
            };
          }
        );
      },

      create: async ({ body, request }) => {
        const { userId, organizationId, actor } = request.authContext;
        const result = await tokenHandlers.create({
          actor,
          userId,
          organizationId,
          name: body.name,
        });

        return result.match(
          ({ token, rawToken }) => ({
            status: 201 as const,
            body: { token, rawToken },
          }),
          (error) => {
            switch (error.type) {
              case 'INVALID_TOKEN_NAME':
                return {
                  status: 400 as const,
                  body: { message: error.message },
                };
              case 'BOT_CANNOT_MANAGE_TOKENS':
                return {
                  status: 403 as const,
                  body: { message: error.message },
                };
              case 'DUPLICATE_TOKEN_NAME':
                return {
                  status: 409 as const,
                  body: { message: error.message },
                };
              case 'TOKEN_LIMIT_REACHED':
                return {
                  status: 409 as const,
                  body: {
                    message: `You can have at most ${error.limit} API tokens per organization`,
                  },
                };
              default:
                request.log.error({ error }, 'Failed to create token');
                return {
                  status: 500 as const,
                  body: { message: 'Failed to create token' },
                };
            }
          }
        );
      },

      rename: async ({ params, body, request }) => {
        const { userId, organizationId, actor } = request.authContext;
        const result = await tokenHandlers.rename({
          actor,
          tokenId: params.tokenId,
          userId,
          organizationId,
          name: body.name,
        });

        return result.match(
          ({ token }) => ({
            status: 200 as const,
            body: token,
          }),
          (error) => {
            switch (error.type) {
              case 'INVALID_TOKEN_NAME':
                return {
                  status: 400 as const,
                  body: { message: error.message },
                };
              case 'BOT_CANNOT_MANAGE_TOKENS':
                return {
                  status: 403 as const,
                  body: { message: error.message },
                };
              case 'TOKEN_OWNERSHIP_ERROR':
                return {
                  status: 403 as const,
                  body: { message: 'You do not own this token' },
                };
              case 'USER_TOKEN_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Token not found' },
                };
              case 'DUPLICATE_TOKEN_NAME':
                return {
                  status: 409 as const,
                  body: { message: error.message },
                };
              default:
                request.log.error({ error }, 'Failed to rename token');
                return {
                  status: 500 as const,
                  body: { message: 'Failed to rename token' },
                };
            }
          }
        );
      },

      delete: async ({ params, request }) => {
        const { userId, actor } = request.authContext;
        const result = await tokenHandlers.revoke({
          actor,
          tokenId: params.tokenId,
          userId,
        });

        return result.match(
          () => ({
            status: 200 as const,
            body: { success: true as const },
          }),
          (error) => {
            switch (error.type) {
              case 'BOT_CANNOT_MANAGE_TOKENS':
                return {
                  status: 403 as const,
                  body: { message: error.message },
                };
              case 'TOKEN_OWNERSHIP_ERROR':
                return {
                  status: 403 as const,
                  body: { message: 'You do not own this token' },
                };
              case 'USER_TOKEN_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Token not found' },
                };
              default:
                request.log.error({ error }, 'Failed to delete token');
                return {
                  status: 500 as const,
                  body: { message: 'Failed to delete token' },
                };
            }
          }
        );
      },
    });

    s.registerRouter(tokenContract, router, protectedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};
