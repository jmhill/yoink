import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { initServer } from '@ts-rest/fastify';
import { signupContract } from '@yoink/api-contracts';
import type { SignupService } from '../domain/signup-service.js';
import type { PasskeyService } from '../domain/passkey-service.js';
import type { SessionService } from '../domain/session-service.js';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { RateLimitConfig } from '../../config/schema.js';

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
};

export const registerSignupRoutes = async (
  app: FastifyInstance,
  deps: SignupRoutesDependencies,
  rateLimitConfig: RateLimitConfig
) => {
  const { signupService, passkeyService, sessionService, sessionCookieName, cookieOptions } = deps;
  const s = initServer();

  // All signup routes are public (no auth required)
  await app.register(async (publicApp) => {
    // Apply strict rate limiting for signup (abuse prevention)
    // Only if rate limiting is enabled
    if (rateLimitConfig.enabled) {
      await publicApp.register(rateLimit, {
        max: rateLimitConfig.signupMax,
        timeWindow: rateLimitConfig.signupTimeWindow,
        keyGenerator: (request) => request.ip,
      });
    }

    const router = s.router(signupContract, {
      options: async ({ body }) => {
        const { code, email } = body;

        // Validate the signup request
        const validateResult = await signupService.validateSignupRequest({ code, email });

        return validateResult.match(
          async ({ invitation, organization }) => {
            // Generate registration options for signup (user doesn't exist yet)
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
              () => ({
                status: 500 as const,
                body: { message: 'Failed to generate registration options' },
              })
            );
          },
          (error) => {
            switch (error.type) {
              case 'INVITATION_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Invitation not found' },
                };
              case 'INVITATION_EXPIRED':
                return {
                  status: 410 as const,
                  body: { message: 'Invitation has expired' },
                };
              case 'INVITATION_ALREADY_ACCEPTED':
                return {
                  status: 410 as const,
                  body: { message: 'Invitation has already been used' },
                };
              case 'INVITATION_EMAIL_MISMATCH':
                return {
                  status: 400 as const,
                  body: { message: 'Email does not match invitation' },
                };
              case 'EMAIL_ALREADY_REGISTERED':
                return {
                  status: 409 as const,
                  body: { message: 'Email is already registered' },
                };
              case 'ORGANIZATION_NOT_FOUND':
              case 'SIGNUP_STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      verify: async ({ body, reply }) => {
        const { challenge, code, email, credential, credentialName } = body;

        // First complete the signup (creates user, org, memberships)
        const signupResult = await signupService.completeSignup({ code, email });

        return signupResult.match(
          async ({ user, personalOrganization, invitedOrganization }) => {
            // Verify the passkey registration
            const verifyResult = await passkeyService.verifyRegistration({
              userId: user.id,
              challenge,
              response: credential as RegistrationResponseJSON,
              credentialName,
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
          (error) => {
            switch (error.type) {
              case 'INVITATION_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Invitation not found' },
                };
              case 'INVITATION_EXPIRED':
                return {
                  status: 410 as const,
                  body: { message: 'Invitation has expired' },
                };
              case 'INVITATION_ALREADY_ACCEPTED':
                return {
                  status: 410 as const,
                  body: { message: 'Invitation has already been used' },
                };
              case 'INVITATION_EMAIL_MISMATCH':
                return {
                  status: 400 as const,
                  body: { message: 'Email does not match invitation' },
                };
              case 'EMAIL_ALREADY_REGISTERED':
                return {
                  status: 409 as const,
                  body: { message: 'Email is already registered' },
                };
              case 'ORGANIZATION_NOT_FOUND':
              case 'SIGNUP_STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },
    });

    s.registerRouter(signupContract, router, publicApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};
