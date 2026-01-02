import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { tokenContract } from '@yoink/api-contracts';
import type { UserTokenService } from '../domain/user-token-service.js';
import type { SessionService } from '../domain/session-service.js';
import type { TokenService } from '../domain/token-service.js';
import {
  createCombinedAuthMiddleware,
  type CombinedAuthMiddlewareDependencies,
} from './combined-auth-middleware.js';

export type TokenRoutesDependencies = {
  userTokenService: UserTokenService;
  sessionService: SessionService;
  tokenService?: TokenService;
  sessionCookieName: string;
};

export const registerTokenRoutes = async (
  app: FastifyInstance,
  deps: TokenRoutesDependencies
) => {
  const { userTokenService, sessionService, tokenService, sessionCookieName } = deps;
  const s = initServer();

  // Create combined auth middleware if tokenService is provided
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

  // All token routes require authentication
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authMiddleware);

    const router = s.router(tokenContract, {
      list: async ({ request }) => {
        const { userId, organizationId } = request.authContext;

        const result = await userTokenService.listTokens(userId, organizationId);

        return result.match(
          (tokens) => ({
            status: 200 as const,
            body: { tokens },
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
        const { userId, organizationId } = request.authContext;
        const { name } = body;

        const result = await userTokenService.createToken({
          userId,
          organizationId,
          name,
        });

        return result.match(
          ({ token, rawToken }) => ({
            status: 201 as const,
            body: { token, rawToken },
          }),
          (error) => {
            switch (error.type) {
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

      delete: async ({ params, request }) => {
        const { userId } = request.authContext;
        const { tokenId } = params;

        const result = await userTokenService.revokeToken(userId, tokenId);

        return result.match(
          () => ({
            status: 200 as const,
            body: { success: true as const },
          }),
          (error) => {
            switch (error.type) {
              case 'USER_TOKEN_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Token not found' },
                };
              case 'TOKEN_OWNERSHIP_ERROR':
                return {
                  status: 403 as const,
                  body: { message: 'You do not own this token' },
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
