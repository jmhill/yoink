import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { passkeyContract } from '@yoink/api-contracts';
import type { PasskeyService } from '../domain/passkey-service.js';
import type { SessionService } from '../domain/session-service.js';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  createCombinedAuthMiddleware,
  type CombinedAuthMiddlewareDependencies,
} from './combined-auth-middleware.js';
import type { TokenService } from '../domain/token-service.js';

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
};

/**
 * Maps PasskeyCredential to the API response format (excludes sensitive data)
 */
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

export const registerPasskeyRoutes = async (
  app: FastifyInstance,
  deps: PasskeyRoutesDependencies
) => {
  const { passkeyService, sessionService, tokenService, sessionCookieName, cookieOptions } = deps;
  const s = initServer();

  // Create combined auth middleware if tokenService is provided
  // Otherwise create a session-only middleware
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

  // All passkey routes require authentication
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authMiddleware);

    const router = s.router(passkeyContract, {
      registerOptions: async ({ request }) => {
        const userId = request.authContext.userId;

        const result = await passkeyService.generateRegistrationOptions(userId);

        return result.match(
          (options) => ({
            status: 200 as const,
            body: {
              options: options.options,
              challenge: options.challenge,
            },
          }),
          (error) => {
            request.log.error({ error }, 'Failed to generate registration options');
            return {
              status: 500 as const,
              body: { message: 'Failed to generate registration options' },
            };
          }
        );
      },

      registerVerify: async ({ body, request, reply }) => {
        const userId = request.authContext.userId;
        const { challenge, credential, credentialName } = body;

        // Verify the passkey registration
        const verifyResult = await passkeyService.verifyRegistration({
          userId,
          challenge,
          response: credential as RegistrationResponseJSON,
          credentialName,
        });

        if (verifyResult.isErr()) {
          const error = verifyResult.error;
          switch (error.type) {
            case 'CHALLENGE_EXPIRED':
              return {
                status: 410 as const,
                body: { message: 'Challenge has expired' },
              };
            case 'VERIFICATION_FAILED':
              return {
                status: 400 as const,
                body: { message: error.reason },
              };
            default:
              request.log.error({ error }, 'Passkey verification failed');
              return {
                status: 500 as const,
                body: { message: 'Passkey registration failed' },
              };
          }
        }

        const passkeyCredential = verifyResult.value;

        // Create a new session for the user (switches them to session auth)
        const sessionResult = await sessionService.createSession({
          userId,
          organizationId: request.authContext.organizationId,
        });

        if (sessionResult.isErr()) {
          request.log.error({ error: sessionResult.error }, 'Failed to create session');
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
          status: 201 as const,
          body: {
            credential: toCredentialInfo(passkeyCredential),
          },
        };
      },

      listCredentials: async ({ request }) => {
        const userId = request.authContext.userId;

        const result = await passkeyService.listCredentials(userId);

        return result.match(
          (credentials) => ({
            status: 200 as const,
            body: {
              credentials: credentials.map(toCredentialInfo),
            },
          }),
          (error) => {
            request.log.error({ error }, 'Failed to list credentials');
            return {
              status: 500 as const,
              body: { message: 'Failed to list credentials' },
            };
          }
        );
      },

      deleteCredential: async ({ params, request }) => {
        const userId = request.authContext.userId;
        const { credentialId } = params;

        const result = await passkeyService.deleteCredentialForUser({
          credentialId,
          userId,
        });

        return result.match(
          () => ({
            status: 200 as const,
            body: { message: 'Passkey deleted' },
          }),
          (error) => {
            switch (error.type) {
              case 'CREDENTIAL_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Passkey not found' },
                };
              case 'CREDENTIAL_OWNERSHIP_ERROR':
                return {
                  status: 403 as const,
                  body: { message: 'You do not own this passkey' },
                };
              case 'CANNOT_DELETE_LAST_PASSKEY':
                return {
                  status: 409 as const,
                  body: { message: 'Cannot delete your last passkey' },
                };
              default:
                request.log.error({ error }, 'Failed to delete credential');
                return {
                  status: 500 as const,
                  body: { message: 'Failed to delete passkey' },
                };
            }
          }
        );
      },
    });

    s.registerRouter(passkeyContract, router, protectedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};
