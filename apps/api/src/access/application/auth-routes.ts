import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { authOrpcContract } from '@yoink/api-contracts/orpc';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { PasskeyService } from '../domain/passkey-service.js';
import type { SessionService } from '../domain/session-service.js';
import type { UserService } from '../domain/user-service.js';
import type { MembershipService } from '../domain/membership-service.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import {
  createCombinedAuthMiddleware,
  type CombinedAuthMiddlewareDependencies,
} from './combined-auth-middleware.js';
import type { TokenService } from '../domain/token-service.js';
import type { RateLimitConfig } from '../../platform/config/schema.js';
import type { ClientIpOf } from '../../shared/request-client-ip.js';
import type { OrpcHttpContext } from '../../shared/orpc/http-context.js';
import { dispatchOrpc } from '../../shared/orpc/dispatch.js';
import { yoinkOpenApiHandlerOptions } from '../../shared/orpc/handler-options.js';
import type { PasskeyServiceError } from '../domain/auth-errors.js';
import {
  withAuthenticatedRateLimit,
  type AuthenticatedRateLimitConsume,
} from './with-authenticated-rate-limit.js';
import { accessHttpError, accessStorageError } from './access-http-errors.js';

export type AuthRoutesDependencies = {
  passkeyService: PasskeyService;
  sessionService: SessionService;
  userService: UserService;
  membershipService: MembershipService;
  organizationStore: OrganizationStore;
  tokenService?: TokenService;
  sessionCookieName: string;
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    path: string;
    maxAge: number; // in seconds
  };
  clientIpOf: ClientIpOf;
  applyAuthenticatedRateLimit?: AuthenticatedRateLimitConsume;
};

const isPublicRoute = (request: FastifyRequest): boolean => {
  return request.url.includes('/auth/login/');
};

const isLoginVerifyRoute = (request: FastifyRequest): boolean => {
  return request.url.includes('/auth/login/verify') && request.method === 'POST';
};

const isAuthenticationResponse = (value: unknown): value is AuthenticationResponseJSON =>
  typeof value === 'object' && value !== null;

const authenticationOptionsFailure = (error: PasskeyServiceError) => {
  switch (error.type) {
    case 'USER_NOT_FOUND':
    case 'CREDENTIAL_NOT_FOUND':
    case 'CHALLENGE_EXPIRED':
    case 'CHALLENGE_MISMATCH':
    case 'VERIFICATION_FAILED':
    case 'COUNTER_REPLAY':
    case 'ORIGIN_MISMATCH':
    case 'RP_ID_MISMATCH':
    case 'CANNOT_DELETE_LAST_PASSKEY':
    case 'CREDENTIAL_OWNERSHIP_ERROR':
    case 'AGENT_CANNOT_USE_PASSKEY':
    case 'PASSKEY_CREDENTIAL_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to generate authentication options');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to generate authentication options');
    }
  }
};

const loginVerifyFailure = (error: PasskeyServiceError) => {
  switch (error.type) {
    case 'CHALLENGE_EXPIRED':
      return accessHttpError({ code: 'GONE', message: 'Challenge has expired' });
    case 'CREDENTIAL_NOT_FOUND':
      return accessHttpError({ code: 'UNAUTHORIZED', message: 'Passkey not recognized' });
    case 'VERIFICATION_FAILED':
      return accessHttpError({ code: 'BAD_REQUEST', message: error.reason });
    case 'USER_NOT_FOUND':
    case 'CHALLENGE_MISMATCH':
    case 'COUNTER_REPLAY':
    case 'ORIGIN_MISMATCH':
    case 'RP_ID_MISMATCH':
    case 'CANNOT_DELETE_LAST_PASSKEY':
    case 'CREDENTIAL_OWNERSHIP_ERROR':
    case 'AGENT_CANNOT_USE_PASSKEY':
    case 'PASSKEY_CREDENTIAL_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessHttpError({ code: 'BAD_REQUEST', message: 'Authentication failed' });
    default: {
      const _never: never = error;
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: 'Authentication failed',
        cause: _never,
      });
    }
  }
};

export const registerAuthRoutes = async (
  app: FastifyInstance,
  deps: AuthRoutesDependencies,
  rateLimitConfig: RateLimitConfig
) => {
  const {
    passkeyService,
    sessionService,
    userService,
    membershipService,
    organizationStore,
    tokenService,
    sessionCookieName,
    cookieOptions,
    clientIpOf,
  } = deps;

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

  const resolvedAuth = createCombinedAuthMiddleware(authMiddlewareDeps);
  const authMiddleware =
    deps.applyAuthenticatedRateLimit === undefined
      ? resolvedAuth
      : withAuthenticatedRateLimit(resolvedAuth, deps.applyAuthenticatedRateLimit);

  const sessionCookieBase = {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
  };

  const auth = implement(authOrpcContract).$context<OrpcHttpContext>();
  const authRouter = auth.router({
    loginOptions: auth.loginOptions.handler(async () => {
      const result = await passkeyService.generateAuthenticationOptions();
      return result.match(
        (options) => ({
          options: options.options,
          challenge: options.challenge,
        }),
        (error) => {
          throw authenticationOptionsFailure(error);
        }
      );
    }),
    loginVerify: auth.loginVerify.handler(async ({ input, context }) => {
      if (!isAuthenticationResponse(input.credential)) {
        throw accessHttpError({ code: 'BAD_REQUEST', message: 'Authentication failed' });
      }

      const verifyResult = await passkeyService.verifyAuthentication({
        challenge: input.challenge,
        response: input.credential,
      });

      if (verifyResult.isErr()) {
        throw loginVerifyFailure(verifyResult.error);
      }

      const { userId } = verifyResult.value;
      const userResult = await userService.getUser(userId);
      if (userResult.isErr() || userResult.value === null) {
        throw accessStorageError(
          userResult.isErr() ? userResult.error : { type: 'USER_NOT_FOUND', userId },
          'Failed to get user info'
        );
      }
      const user = userResult.value;

      const sessionResult = await sessionService.createSession({ userId });
      if (sessionResult.isErr()) {
        throw accessStorageError(sessionResult.error, 'Failed to create session');
      }
      const session = sessionResult.value;

      context.reply.setCookie(sessionCookieName, session.id, {
        ...sessionCookieBase,
        maxAge: cookieOptions.maxAge,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
        },
      };
    }),
    logout: auth.logout.handler(async ({ context }) => {
      const session = context.request.userSession;
      if (session) {
        await sessionService.revokeSession(session.id);
      }

      context.reply.clearCookie(sessionCookieName, sessionCookieBase);

      return { success: true as const };
    }),
    session: auth.session.handler(async ({ context }) => {
      const { userId, organizationId } = context.request.authContext;
      const userResult = await userService.getUser(userId);
      if (userResult.isErr() || userResult.value === null) {
        throw accessStorageError(
          userResult.isErr() ? userResult.error : { type: 'USER_NOT_FOUND', userId },
          'Failed to get user info'
        );
      }
      const user = userResult.value;

      const membershipsResult = await membershipService.listMemberships({ userId });
      if (membershipsResult.isErr()) {
        throw accessStorageError(membershipsResult.error, 'Failed to get memberships');
      }

      const organizations = await Promise.all(
        membershipsResult.value.map(async (membership) => {
          const orgResult = await organizationStore.findById(membership.organizationId);
          const org = orgResult.isOk() ? orgResult.value : null;
          return {
            id: membership.organizationId,
            name: org?.name ?? 'Unknown Organization',
            isPersonal: membership.isPersonalOrg,
            role: membership.role,
          };
        })
      );

      return {
        user: {
          id: user.id,
          email: user.email,
        },
        organizationId,
        organizations,
      };
    }),
  });

  const handler = new OpenAPIHandler(authRouter, yoinkOpenApiHandlerOptions);

  await app.register(async (authApp) => {
    if (rateLimitConfig.enabled) {
      await authApp.register(rateLimit, {
        max: rateLimitConfig.authLoginMax,
        timeWindow: rateLimitConfig.authLoginTimeWindow,
        keyGenerator: (request) => clientIpOf(request),
        allowList: (request) => !isLoginVerifyRoute(request),
      });
    }

    authApp.addHook('preHandler', async (request, reply) => {
      if (isPublicRoute(request)) {
        return;
      }
      return authMiddleware(request, reply);
    });

    const mount = (
      method: 'GET' | 'POST' | Array<'GET' | 'POST'>,
      url: string
    ) => {
      authApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount('POST', '/api/auth/login/options');
    mount('POST', '/api/auth/login/verify');
    mount('POST', '/api/auth/logout');
    mount('GET', '/api/auth/session');
  });
};
