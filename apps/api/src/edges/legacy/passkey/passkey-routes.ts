import type { FastifyInstance } from 'fastify';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { passkeyOrpcContract } from '@yoink/api-contracts/orpc';
import type { PasskeyService } from '../../../access/application/handle-passkey.js';
import type { SessionService } from '../../../access/domain/session-service.js';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { authenticateTokenWith } from '../../../access/application/authenticate-principal.js';
import {
  unauthenticatedToken,
  userSessionAuthFromService,
} from '../../_shared/auth/auth-from-services.js';
import {
  createCombinedAuthMiddleware,
  type CombinedAuthMiddlewareDependencies,
} from '../../_shared/auth/combined-auth-middleware.js';
import type { TokenService } from '../../../access/domain/token-service.js';
import { dispatchOrpc } from '../../_shared/orpc/dispatch.js';
import { yoinkOpenApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import type { PasskeyServiceError } from '../../../access/domain/auth-errors.js';
import {
  withAuthenticatedRateLimit,
  type AuthenticatedRateLimitConsume,
} from '../../_shared/auth/with-authenticated-rate-limit.js';
import { accessHttpError, accessStorageError } from '../../_shared/auth/access-http-errors.js';

export type PasskeyRoutesDependencies = {
  passkeyService: PasskeyService;
  sessionService: SessionService;
  tokenService?: TokenService;
  sessionCookieName: string;
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    path: string;
    maxAge: number; // in seconds
  };
  applyAuthenticatedRateLimit?: AuthenticatedRateLimitConsume;
};

const toCredentialInfo = (credential: {
  id: string;
  name?: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt?: string;
}) => ({
  id: credential.id,
  name: credential.name,
  deviceType: credential.deviceType,
  backedUp: credential.backedUp,
  createdAt: credential.createdAt,
  lastUsedAt: credential.lastUsedAt,
});

const isRegistrationResponse = (value: unknown): value is RegistrationResponseJSON =>
  typeof value === 'object' && value !== null;

const registrationOptionsFailure = (error: PasskeyServiceError) => {
  switch (error.type) {
    case 'AGENT_CANNOT_USE_PASSKEY':
      return accessHttpError({ code: 'FORBIDDEN', message: 'Agents cannot register passkeys' });
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
    case 'PASSKEY_CREDENTIAL_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to generate registration options');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to generate registration options');
    }
  }
};

const registrationVerifyFailure = (error: PasskeyServiceError) => {
  switch (error.type) {
    case 'CHALLENGE_EXPIRED':
      return accessHttpError({ code: 'GONE', message: 'Challenge has expired' });
    case 'VERIFICATION_FAILED':
      return accessHttpError({ code: 'BAD_REQUEST', message: error.reason });
    case 'USER_NOT_FOUND':
    case 'CREDENTIAL_NOT_FOUND':
    case 'CHALLENGE_MISMATCH':
    case 'COUNTER_REPLAY':
    case 'ORIGIN_MISMATCH':
    case 'RP_ID_MISMATCH':
    case 'CANNOT_DELETE_LAST_PASSKEY':
    case 'CREDENTIAL_OWNERSHIP_ERROR':
    case 'AGENT_CANNOT_USE_PASSKEY':
    case 'PASSKEY_CREDENTIAL_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, 'Passkey registration failed', 'Passkey verification failed');
    default: {
      const _never: never = error;
      return accessStorageError(
        _never,
        'Passkey registration failed',
        'Passkey verification failed'
      );
    }
  }
};

const deleteCredentialFailure = (error: PasskeyServiceError) => {
  switch (error.type) {
    case 'CREDENTIAL_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'Passkey not found' });
    case 'CREDENTIAL_OWNERSHIP_ERROR':
      return accessHttpError({ code: 'FORBIDDEN', message: 'You do not own this passkey' });
    case 'CANNOT_DELETE_LAST_PASSKEY':
      return accessHttpError({ code: 'CONFLICT', message: 'Cannot delete your last passkey' });
    case 'USER_NOT_FOUND':
    case 'CHALLENGE_EXPIRED':
    case 'CHALLENGE_MISMATCH':
    case 'VERIFICATION_FAILED':
    case 'COUNTER_REPLAY':
    case 'ORIGIN_MISMATCH':
    case 'RP_ID_MISMATCH':
    case 'AGENT_CANNOT_USE_PASSKEY':
    case 'PASSKEY_CREDENTIAL_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to delete passkey', 'Failed to delete credential');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to delete passkey', 'Failed to delete credential');
    }
  }
};

export const registerPasskeyRoutes = async (
  app: FastifyInstance,
  deps: PasskeyRoutesDependencies
) => {
  const { passkeyService, sessionService, tokenService, sessionCookieName, cookieOptions } = deps;

  const sessionAuth = userSessionAuthFromService(sessionService);
  const authMiddlewareDeps: CombinedAuthMiddlewareDependencies = {
    authenticateToken: tokenService
      ? authenticateTokenWith(tokenService)
      : unauthenticatedToken,
    authenticateSession: sessionAuth.authenticateSession,
    recordSessionActivity: sessionAuth.recordSessionActivity,
    sessionCookieName,
  };

  const resolvedAuth = createCombinedAuthMiddleware(authMiddlewareDeps);
  const authMiddleware =
    deps.applyAuthenticatedRateLimit === undefined
      ? resolvedAuth
      : withAuthenticatedRateLimit(resolvedAuth, deps.applyAuthenticatedRateLimit);

  const passkey = implement(passkeyOrpcContract).$context<OrpcHttpContext>();
  const passkeyRouter = passkey.router({
    registerOptions: passkey.registerOptions.handler(async ({ context }) => {
      const result = await passkeyService.generateRegistrationOptions(
        context.request.authContext.userId
      );
      return result.match(
        (options) => ({
          options: options.options,
          challenge: options.challenge,
        }),
        (error) => {
          throw registrationOptionsFailure(error);
        }
      );
    }),
    registerVerify: passkey.registerVerify.handler(async ({ input, context }) => {
      if (!isRegistrationResponse(input.credential)) {
        throw accessHttpError({ code: 'BAD_REQUEST', message: 'Passkey registration failed' });
      }

      const userId = context.request.authContext.userId;
      const verifyResult = await passkeyService.verifyRegistration({
        userId,
        challenge: input.challenge,
        response: input.credential,
        credentialName: input.credentialName,
      });
      if (verifyResult.isErr()) {
        throw registrationVerifyFailure(verifyResult.error);
      }

      const sessionResult = await sessionService.createSession({
        userId,
        organizationId: context.request.authContext.organizationId,
      });
      if (sessionResult.isErr()) {
        throw accessStorageError(sessionResult.error, 'Failed to create session');
      }

      context.reply.setCookie(sessionCookieName, sessionResult.value.id, {
        httpOnly: cookieOptions.httpOnly,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
        path: cookieOptions.path,
        maxAge: cookieOptions.maxAge,
      });

      return {
        credential: toCredentialInfo(verifyResult.value),
      };
    }),
    listCredentials: passkey.listCredentials.handler(async ({ context }) => {
      const result = await passkeyService.listCredentials(context.request.authContext.userId);
      return result.match(
        (credentials) => ({
          credentials: credentials.map(toCredentialInfo),
        }),
        (error) => {
          throw accessStorageError(error, 'Failed to list credentials');
        }
      );
    }),
    deleteCredential: passkey.deleteCredential.handler(async ({ input, context }) => {
      const result = await passkeyService.deleteCredentialForUser({
        credentialId: input.credentialId,
        userId: context.request.authContext.userId,
      });
      return result.match(
        () => ({ message: 'Passkey deleted' }),
        (error) => {
          throw deleteCredentialFailure(error);
        }
      );
    }),
  });

  const handler = new OpenAPIHandler(passkeyRouter, yoinkOpenApiHandlerOptions);

  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authMiddleware);

    const mount = (
      method: 'GET' | 'POST' | 'DELETE',
      url: string
    ) => {
      protectedApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount('POST', '/api/auth/passkey/register/options');
    mount('POST', '/api/auth/passkey/register/verify');
    mount('GET', '/api/auth/passkey/credentials');
    mount('DELETE', '/api/auth/passkey/credentials/:credentialId');
  });
};
