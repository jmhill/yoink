import { implement } from '@orpc/server';
import { webAuthContract } from '@yoink/api-contracts/web';
import type { ResultAsync } from 'neverthrow';
import type { Access } from '../../access/index.js';
import type { HandleAcceptInvitationError } from '../../access/application/handle-accept-invitation.js';
import type { HandleValidateInvitationError } from '../../access/application/handle-validate-invitation.js';
import type { AcceptInvitation } from '../../access/domain/decide-accept-invitation.js';
import type { ValidateInvitation } from '../../access/domain/decide-validate-invitation.js';
import type { Invitation } from '../../access/domain/invitation.js';
import type { MembershipService } from '../../access/domain/membership-service.js';
import type { OrganizationService } from '../../access/domain/organization-service.js';
import type { OrganizationStore } from '../../access/domain/organization-store.js';
import type { PasskeyService } from '../../access/domain/passkey-service.js';
import type { SessionService } from '../../access/domain/session-service.js';
import type { SignupService } from '../../access/domain/signup-service.js';
import type { UserService } from '../../access/domain/user-service.js';
import type { ClientIpOf } from '../_shared/request-client-ip.js';
import {
  acceptInvitationErrorResponse,
  accessHttpError,
  accessInternalError,
  accessStorageError,
  validateInvitationErrorResponse,
} from '../_shared/auth/access-http-errors.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import type { RateLimitConfig } from '../../platform/config/schema.js';
import {
  authenticationOptionsFailure,
  deleteCredentialFailure,
  isAuthenticationResponse,
  isRegistrationResponse,
  loginVerifyFailure,
  registrationOptionsFailure,
  registrationVerifyFailure,
} from './auth-errors.js';

export type WebAuthCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  maxAge: number;
};

/**
 * Methods this screen calls. The rest of each service stays off the port.
 * Login verify and passkey registration verify still run the legacy access
 * sequence (verify, then create session). Both writes are access. They are
 * not a cross-module workflow. One access command is M5.13-passkey and
 * M5.13-session.
 */
export type WebAuthDependencies = {
  passkeyService: Pick<
    PasskeyService,
    | 'generateAuthenticationOptions'
    | 'verifyAuthentication'
    | 'generateSignupRegistrationOptions'
    | 'generateRegistrationOptions'
    | 'verifyRegistration'
    | 'listCredentials'
    | 'deleteCredentialForUser'
  >;
  sessionService: Pick<SessionService, 'createSession' | 'revokeSession'>;
  userService: Pick<UserService, 'getUser'>;
  membershipService: Pick<MembershipService, 'listMemberships'>;
  organizationStore: Pick<OrganizationStore, 'findById'>;
  organizationService: Pick<OrganizationService, 'getOrganization'>;
  signupService: Pick<SignupService, 'validateSignupRequest'>;
  completeSignup: Access['commands']['completeSignup'];
  validateInvitation: (
    query: ValidateInvitation
  ) => ResultAsync<Invitation, HandleValidateInvitationError>;
  acceptInvitation: (
    command: AcceptInvitation
  ) => ResultAsync<Invitation, HandleAcceptInvitationError>;
  sessionCookieName: string;
  cookieOptions: WebAuthCookieOptions;
  clientIpOf: ClientIpOf;
  rateLimit: RateLimitConfig;
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

/**
 * Login, signup, session, passkeys, and join.
 * Signup verify is one access command. The other handlers are one command
 * or only queries, except the two legacy access sequences noted above.
 */
export const createWebAuthHandlers = (deps: WebAuthDependencies) => {
  const web = implement(webAuthContract).$context<OrpcHttpContext>();
  const sessionCookieBase = {
    httpOnly: deps.cookieOptions.httpOnly,
    secure: deps.cookieOptions.secure,
    sameSite: deps.cookieOptions.sameSite,
    path: deps.cookieOptions.path,
  };

  return web.router({
    loginOptions: web.loginOptions.handler(async () => {
      const result = await deps.passkeyService.generateAuthenticationOptions();
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
    loginVerify: web.loginVerify.handler(async ({ input, context }) => {
      if (!isAuthenticationResponse(input.credential)) {
        throw accessHttpError({ code: 'BAD_REQUEST', message: 'Authentication failed' });
      }

      const verifyResult = await deps.passkeyService.verifyAuthentication({
        challenge: input.challenge,
        response: input.credential,
      });
      if (verifyResult.isErr()) {
        throw loginVerifyFailure(verifyResult.error);
      }

      const { userId } = verifyResult.value;
      const userResult = await deps.userService.getUser(userId);
      if (userResult.isErr() || userResult.value === null) {
        throw accessStorageError(
          userResult.isErr() ? userResult.error : { type: 'USER_NOT_FOUND', userId },
          'Failed to get user info'
        );
      }
      const user = userResult.value;

      const sessionResult = await deps.sessionService.createSession({ userId });
      if (sessionResult.isErr()) {
        throw accessStorageError(sessionResult.error, 'Failed to create session');
      }

      context.reply.setCookie(deps.sessionCookieName, sessionResult.value.id, {
        ...sessionCookieBase,
        maxAge: deps.cookieOptions.maxAge,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
        },
      };
    }),
    logout: web.logout.handler(async ({ context }) => {
      const session = context.request.userSession;
      if (session) {
        await deps.sessionService.revokeSession(session.id);
      }

      context.reply.clearCookie(deps.sessionCookieName, sessionCookieBase);
      return { success: true as const };
    }),
    session: web.session.handler(async ({ context }) => {
      const { userId, organizationId } = context.request.authContext;
      const userResult = await deps.userService.getUser(userId);
      if (userResult.isErr() || userResult.value === null) {
        throw accessStorageError(
          userResult.isErr() ? userResult.error : { type: 'USER_NOT_FOUND', userId },
          'Failed to get user info'
        );
      }
      const user = userResult.value;

      const membershipsResult = await deps.membershipService.listMemberships({ userId });
      if (membershipsResult.isErr()) {
        throw accessStorageError(membershipsResult.error, 'Failed to get memberships');
      }

      const organizations = await Promise.all(
        membershipsResult.value.map(async (membership) => {
          const orgResult = await deps.organizationStore.findById(membership.organizationId);
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
    signupOptions: web.signupOptions.handler(async ({ input }) => {
      const validateResult = await deps.signupService.validateSignupRequest({
        code: input.code,
        email: input.email,
      });
      if (validateResult.isErr()) {
        throw acceptInvitationErrorResponse(validateResult.error);
      }

      const { invitation, organization } = validateResult.value;
      const optionsResult = await deps.passkeyService.generateSignupRegistrationOptions({
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
    signupVerify: web.signupVerify.handler(async ({ input, context }) => {
      if (!isRegistrationResponse(input.credential)) {
        throw accessHttpError({ code: 'BAD_REQUEST', message: 'Passkey registration failed' });
      }

      const signupResult = await deps.completeSignup({
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
      context.reply.setCookie(deps.sessionCookieName, sessionId, {
        ...sessionCookieBase,
        maxAge: deps.cookieOptions.maxAge,
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
    validateInvitation: web.validateInvitation.handler(async ({ input }) => {
      const result = await deps.validateInvitation({
        code: input.code,
        email: input.email,
      });
      if (result.isErr()) {
        throw validateInvitationErrorResponse(result.error);
      }

      const invitation = result.value;
      const orgResult = await deps.organizationService.getOrganization(invitation.organizationId);
      if (orgResult.isErr()) {
        throw accessInternalError(orgResult.error);
      }
      const organizationName = orgResult.value ? orgResult.value.name : undefined;

      return {
        ...invitation,
        organizationName,
      };
    }),
    acceptInvitation: web.acceptInvitation.handler(async ({ input, context }) => {
      const userResult = await deps.userService.getUser(context.request.authContext.userId);
      if (userResult.isErr()) {
        throw accessInternalError(userResult.error);
      }
      if (userResult.value === null) {
        throw accessInternalError({
          type: 'USER_NOT_FOUND',
          userId: context.request.authContext.userId,
        });
      }

      const result = await deps.acceptInvitation({
        code: input.code,
        account: {
          userId: context.request.authContext.userId,
          email: userResult.value.email,
        },
      });
      return result.match(
        (invitation) => invitation,
        (error) => {
          throw acceptInvitationErrorResponse(error);
        }
      );
    }),
    registerPasskeyOptions: web.registerPasskeyOptions.handler(async ({ context }) => {
      const result = await deps.passkeyService.generateRegistrationOptions(
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
    registerPasskey: web.registerPasskey.handler(async ({ input, context }) => {
      if (!isRegistrationResponse(input.credential)) {
        throw accessHttpError({ code: 'BAD_REQUEST', message: 'Passkey registration failed' });
      }

      const userId = context.request.authContext.userId;
      const verifyResult = await deps.passkeyService.verifyRegistration({
        userId,
        challenge: input.challenge,
        response: input.credential,
        credentialName: input.credentialName,
      });
      if (verifyResult.isErr()) {
        throw registrationVerifyFailure(verifyResult.error);
      }

      const sessionResult = await deps.sessionService.createSession({
        userId,
        organizationId: context.request.authContext.organizationId,
      });
      if (sessionResult.isErr()) {
        throw accessStorageError(sessionResult.error, 'Failed to create session');
      }

      context.reply.setCookie(deps.sessionCookieName, sessionResult.value.id, {
        ...sessionCookieBase,
        maxAge: deps.cookieOptions.maxAge,
      });

      return {
        credential: toCredentialInfo(verifyResult.value),
      };
    }),
    listPasskeys: web.listPasskeys.handler(async ({ context }) => {
      const result = await deps.passkeyService.listCredentials(context.request.authContext.userId);
      return result.match(
        (credentials) => ({
          credentials: credentials.map(toCredentialInfo),
        }),
        (error) => {
          throw accessStorageError(error, 'Failed to list credentials');
        }
      );
    }),
    deletePasskey: web.deletePasskey.handler(async ({ input, context }) => {
      const result = await deps.passkeyService.deleteCredentialForUser({
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
};
