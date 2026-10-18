import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { initServer } from '@ts-rest/fastify';
import { signupContract } from '@yoink/api-contracts';
import type { SignupService } from '../domain/signup-service.js';
import type { PasskeyService } from '../domain/passkey-service.js';
import type { SessionService } from '../domain/session-service.js';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { RateLimitConfig } from '../../config/schema.js';
import { namedRequestValidationError } from '../../shared/request-validation.js';
import type { ClientIpOf } from '../../shared/request-client-ip.js';
import {
  acceptInvitationErrorResponse,
  logAndReturnStorageFailure,
} from './access-http-errors.js';

export type SignupRoutesDependencies = {
  signupService: SignupService;
  passkeyService: PasskeyService;
  sessionService: SessionService;
  /** Session cookie name */
  sessionCookieName: string;
  /** Session cookie settings */
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    path: string;
    maxAge: number; // in seconds
  };
  clientIpOf: ClientIpOf;
};

export const registerSignupRoutes = async (
  app: FastifyInstance,
  deps: SignupRoutesDependencies,
  rateLimitConfig: RateLimitConfig
) => {
  const { signupService, passkeyService, sessionService, sessionCookieName, cookieOptions, clientIpOf } = deps;
  const s = initServer();

  // All signup routes are public (no auth required)
  await app.register(async (publicApp) => {
    // Apply strict rate limiting for signup (abuse prevention)
    // Only if rate limiting is enabled
    if (rateLimitConfig.enabled) {
      await publicApp.register(rateLimit, {
        max: rateLimitConfig.signupMax,
        timeWindow: rateLimitConfig.signupTimeWindow,
        keyGenerator: (request) => clientIpOf(request),
      });
    }

    const router = s.router(signupContract, {
      options: async ({ body, request }) => {
        const { code, email } = body;

        const validateResult = await signupService.validateSignupRequest({ code, email });

        return validateResult.match(
          async ({ invitation, organization }) => {
            const optionsResult = await passkeyService.generateSignupRegistrationOptions({
              email,
              identifier: email,
            });

            return optionsResult.match(
              (options) => ({
                status: 200 as const,
                body: {
                  options: options.options,
                  challenge: options.challenge,
                  organizationId: organization.id,
                  organizationName: organization.name,
                  role: invitation.role,
                },
              }),
              (error) =>
                logAndReturnStorageFailure(
                  request,
                  error,
                  'Failed to generate registration options'
                )
            );
          },
          (error) => acceptInvitationErrorResponse(request, error)
        );
      },

      verify: async ({ body, reply, request }) => {
        const { challenge, code, email, credential, credentialName } = body;

        // First complete the signup (creates user, org, memberships)
        const signupResult = await signupService.completeSignup({ code, email });

        return signupResult.match(
          async ({ user, personalOrganization, invitedOrganization }) => {
            // Verify the passkey registration
            // skipUserIdCheck is true because the challenge was created with email as identifier
            // during /signup/options, before the user existed
            const verifyResult = await passkeyService.verifyRegistration({
              userId: user.id,
              challenge,
              response: credential as RegistrationResponseJSON,
              credentialName,
              skipUserIdCheck: true,
            });

            if (verifyResult.isErr()) {
              // If passkey verification fails, the user was already created
              // In production, this should be a transaction
              // TODO: Wrap in database transaction
              return {
                status: 400 as const,
                body: { message: 'Passkey registration failed' },
              };
            }

            // Create a session for the new user
            const sessionResult = await sessionService.createSession({
              userId: user.id,
              organizationId: personalOrganization.id, // Start in personal org
            });

            if (sessionResult.isErr()) {
              return logAndReturnStorageFailure(
                request,
                sessionResult.error,
                'Failed to create session'
              );
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
                user: {
                  id: user.id,
                  email: user.email,
                },
                personalOrganization: {
                  id: personalOrganization.id,
                  name: personalOrganization.name,
                },
                invitedOrganization: {
                  id: invitedOrganization.id,
                  name: invitedOrganization.name,
                  role: invitedOrganization.role,
                },
              },
            };
          },
          (error) => acceptInvitationErrorResponse(request, error)
        );
      },
    });

    s.registerRouter(signupContract, router, publicApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send(namedRequestValidationError(err));
      },
    });
  });
};
