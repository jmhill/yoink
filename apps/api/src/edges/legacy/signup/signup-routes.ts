import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { signupOrpcContract } from '@yoink/api-contracts/orpc';
import type { SignupService } from '../../../access/domain/signup-service.js';
import type { PasskeyService } from '../../../access/domain/passkey-service.js';
import type { SessionService } from '../../../access/domain/session-service.js';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { RateLimitConfig } from '../../../platform/config/schema.js';
import type { ClientIpOf } from '../../_shared/request-client-ip.js';
import { dispatchOrpc } from '../../_shared/orpc/dispatch.js';
import { yoinkOpenApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import {
  acceptInvitationErrorResponse,
  accessHttpError,
  accessStorageError,
} from '../../../access/application/access-http-errors.js';

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

const isRegistrationResponse = (value: unknown): value is RegistrationResponseJSON =>
  typeof value === 'object' && value !== null;

export const registerSignupRoutes = async (
  app: FastifyInstance,
  deps: SignupRoutesDependencies,
  rateLimitConfig: RateLimitConfig
) => {
  const {
    signupService,
    passkeyService,
    sessionService,
    sessionCookieName,
    cookieOptions,
    clientIpOf,
  } = deps;

  const sessionCookieBase = {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
  };

  const signup = implement(signupOrpcContract).$context<OrpcHttpContext>();
  const signupRouter = signup.router({
    options: signup.options.handler(async ({ input }) => {
      const validateResult = await signupService.validateSignupRequest({
        code: input.code,
        email: input.email,
      });
      if (validateResult.isErr()) {
        throw acceptInvitationErrorResponse(validateResult.error);
      }

      const { invitation, organization } = validateResult.value;
      const optionsResult = await passkeyService.generateSignupRegistrationOptions({
        email: input.email,
        identifier: input.email,
      });
      if (optionsResult.isErr()) {
        throw accessStorageError(optionsResult.error, 'Failed to generate registration options');
      }

      return {
        options: optionsResult.value.options,
        challenge: optionsResult.value.challenge,
        organizationId: organization.id,
        organizationName: organization.name,
        role: invitation.role,
      };
    }),
    verify: signup.verify.handler(async ({ input, context }) => {
      const signupResult = await signupService.completeSignup({
        code: input.code,
        email: input.email,
      });
      if (signupResult.isErr()) {
        throw acceptInvitationErrorResponse(signupResult.error);
      }

      const { user, personalOrganization, invitedOrganization } = signupResult.value;
      if (!isRegistrationResponse(input.credential)) {
        throw accessHttpError({ code: 'BAD_REQUEST', message: 'Passkey registration failed' });
      }

      const verifyResult = await passkeyService.verifyRegistration({
        userId: user.id,
        challenge: input.challenge,
        response: input.credential,
        credentialName: input.credentialName,
        skipUserIdCheck: true,
      });

      if (verifyResult.isErr()) {
        throw accessHttpError({ code: 'BAD_REQUEST', message: 'Passkey registration failed' });
      }

      const sessionResult = await sessionService.createSession({
        userId: user.id,
        organizationId: personalOrganization.id,
      });
      if (sessionResult.isErr()) {
        throw accessStorageError(sessionResult.error, 'Failed to create session');
      }

      context.reply.setCookie(sessionCookieName, sessionResult.value.id, {
        ...sessionCookieBase,
        maxAge: cookieOptions.maxAge,
      });

      return {
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
      };
    }),
  });

  const handler = new OpenAPIHandler(signupRouter, yoinkOpenApiHandlerOptions);

  await app.register(async (publicApp) => {
    if (rateLimitConfig.enabled) {
      await publicApp.register(rateLimit, {
        max: rateLimitConfig.signupMax,
        timeWindow: rateLimitConfig.signupTimeWindow,
        keyGenerator: (request) => clientIpOf(request),
      });
    }

    const mount = (url: string) => {
      publicApp.route({
        method: 'POST',
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount('/api/auth/signup/options');
    mount('/api/auth/signup/verify');
  });
};
