import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { initServer } from '@ts-rest/fastify';
import { authContract } from '@yoink/api-contracts';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { PasskeyService } from '../domain/passkey-service.js';
import type { SessionService } from '../domain/session-service.js';
import type { UserService } from '../../users/domain/user-service.js';
import {
  createCombinedAuthMiddleware,
  type CombinedAuthMiddlewareDependencies,
} from './combined-auth-middleware.js';
import type { TokenService } from '../domain/token-service.js';
import type { RateLimitConfig } from '../../config/schema.js';

export type AuthRoutesDependencies = {
  passkeyService: PasskeyService;
  sessionService: SessionService;
  userService: UserService;
  tokenService?: TokenService;
  sessionCookieName: string;
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    path: string;
    maxAge: number; // in seconds
  };
};

// Helper to check if a route is public (no auth required)
const isPublicRoute = (request: FastifyRequest): boolean => {
  return request.url.includes('/auth/login/');
};

// Helper to check if request is a login verification attempt
// Only these should be rate limited (brute force protection)
const isLoginVerifyRoute = (request: FastifyRequest): boolean => {
  return request.url.includes('/auth/login/verify') && request.method === 'POST';
};

export const registerAuthRoutes = async (
  app: FastifyInstance,
  deps: AuthRoutesDependencies,
  rateLimitConfig: RateLimitConfig
) => {
  const { passkeyService, sessionService, userService, tokenService, sessionCookieName, cookieOptions } = deps;
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

  await app.register(async (authApp) => {
    // Apply strict rate limiting only to login verify endpoint (brute force protection)
    // The /login/options endpoint is not rate limited as it doesn't validate credentials
    // Only if rate limiting is enabled
    if (rateLimitConfig.enabled) {
      await authApp.register(rateLimit, {
        max: rateLimitConfig.authLoginMax,
        timeWindow: rateLimitConfig.authLoginTimeWindow,
        keyGenerator: (request) => request.ip,
        // Only apply rate limiting to the login verify endpoint
        allowList: (request) => !isLoginVerifyRoute(request),
      });
    }

    // Apply auth middleware conditionally - skip for public routes
    authApp.addHook('preHandler', async (request, reply) => {
      if (isPublicRoute(request)) {
        return; // Skip auth for login routes
      }
      return authMiddleware(request, reply);
    });

    const router = s.router(authContract, {
      loginOptions: async () => {
        // Generate authentication options for discoverable credentials
        // No userId = empty allowCredentials = user selects passkey on device
        const result = await passkeyService.generateAuthenticationOptions();

        return result.match(
          (options) => ({
            status: 200 as const,
            body: {
              options: options.options,
              challenge: options.challenge,
            },
          }),
          () => ({
            status: 500 as const,
            body: { message: 'Failed to generate authentication options' },
          })
        );
      },

      loginVerify: async ({ body, reply }) => {
        const { challenge, credential } = body;

        // Verify the passkey authentication
        const verifyResult = await passkeyService.verifyAuthentication({
          challenge,
          response: credential as AuthenticationResponseJSON,
        });

        if (verifyResult.isErr()) {
          const error = verifyResult.error;
          switch (error.type) {
            case 'CHALLENGE_EXPIRED':
              return {
                status: 410 as const,
                body: { message: 'Challenge has expired' },
              };
            case 'CREDENTIAL_NOT_FOUND':
              return {
                status: 401 as const,
                body: { message: 'Passkey not recognized' },
              };
            case 'VERIFICATION_FAILED':
              return {
                status: 400 as const,
                body: { message: error.reason },
              };
            default:
              return {
                status: 400 as const,
                body: { message: 'Authentication failed' },
              };
          }
        }

        const { userId } = verifyResult.value;

        // Get user info
        const userResult = await userService.getUser(userId);
        if (userResult.isErr() || !userResult.value) {
          return {
            status: 500 as const,
            body: { message: 'Failed to get user info' },
          };
        }

        const user = userResult.value;

        // Create a new session for the user
        const sessionResult = await sessionService.createSession({ userId });

        if (sessionResult.isErr()) {
          return {
            status: 500 as const,
            body: { message: 'Failed to create session' },
          };
        }

        const session = sessionResult.value;

        // Set session cookie
        reply.setCookie(sessionCookieName, session.id, {
          httpOnly: cookieOptions.httpOnly,
          secure: cookieOptions.secure,
          sameSite: cookieOptions.sameSite,
          path: cookieOptions.path,
          maxAge: cookieOptions.maxAge,
        });

        return {
          status: 200 as const,
          body: {
            user: {
              id: user.id,
              email: user.email,
            },
          },
        };
      },

      logout: async ({ request, reply }) => {
        const session = request.userSession;

        if (session) {
          // Revoke the session
          await sessionService.revokeSession(session.id);
        }

        // Clear the session cookie
        reply.clearCookie(sessionCookieName, {
          httpOnly: cookieOptions.httpOnly,
          secure: cookieOptions.secure,
          sameSite: cookieOptions.sameSite,
          path: cookieOptions.path,
        });

        return {
          status: 200 as const,
          body: { success: true as const },
        };
      },

      session: async ({ request }) => {
        const { userId, organizationId } = request.authContext;

        // Get user info
        const userResult = await userService.getUser(userId);
        if (userResult.isErr() || !userResult.value) {
          return {
            status: 500 as const,
            body: { message: 'Failed to get user info' },
          };
        }

        const user = userResult.value;

        return {
          status: 200 as const,
          body: {
            user: {
              id: user.id,
              email: user.email,
            },
            organizationId,
          },
        };
      },
    });

    s.registerRouter(authContract, router, authApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};
