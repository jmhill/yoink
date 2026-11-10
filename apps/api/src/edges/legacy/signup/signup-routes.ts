import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { signupOrpcContract } from '@yoink/api-contracts/orpc';
import type { Access } from '../../../access/index.js';
import type { SignupService } from '../../../access/domain/signup-service.js';
import type { PasskeyService } from '../../../access/application/handle-passkey.js';
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
} from '../../_shared/auth/access-http-errors.js';

export type SignupRoutesDependencies = {
  signupService: SignupService;
  passkeyService: PasskeyService;
  completeSignup: Access['commands']['completeSignup'];
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
    completeSignup,
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
      if (!isRegistrationResponse(input.credential)) {
        throw accessHttpError({ code: 'BAD_REQUEST', message: 'Passkey registration failed' });
      }

      const signupResult = await completeSignup({
        code: input.code,
        email: input.email,
        challenge: input.challenge,
        credential: input.credential,
        ...(input.credentialName === undefined
          ? {}
          : { credentialName: input.credentialName }),
      });
      if (signupResult.isErr()) {
        if (signupResult.error.type === 'PASSKEY_REGISTRATION_FAILED') {
          throw accessHttpError({ code: 'BAD_REQUEST', message: 'Passkey registration failed' });
        }
        throw acceptInvitationErrorResponse(signupResult.error);
      }

      const { user, personalOrganization, invitedOrganization, sessionId } = signupResult.value;
      context.reply.setCookie(sessionCookieName, sessionId, {
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
