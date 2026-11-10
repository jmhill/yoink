import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import {
  LoginOptionsResponseSchema,
  LoginVerifyRequestSchema,
  LoginVerifyResponseSchema,
  LogoutResponseSchema,
  SessionInfoResponseSchema,
} from '../schemas/auth.js';
import { AcceptInvitationSchema, InvitationSchema, ValidateInvitationSchema } from '../schemas/invitation.js';
import {
  PasskeyCredentialsListResponseSchema,
  PasskeyDeleteResponseSchema,
  PasskeyRegisterOptionsResponseSchema,
  PasskeyRegisterVerifyRequestSchema,
  PasskeyRegisterVerifyResponseSchema,
} from '../schemas/passkey.js';
import {
  SignupOptionsRequestSchema,
  SignupOptionsResponseSchema,
  SignupVerifyRequestSchema,
  SignupVerifyResponseSchema,
} from '../schemas/signup.js';

const emptyBody = z.object({});

/** Logout sends no JSON body. A missing body arrives as null once path params are absent. */
const absentOrEmptyBody = z.union([emptyBody, z.null(), z.undefined()]);

const credentialId = z.object({
  credentialId: z.string(),
});

/**
 * Login, signup, session, passkeys, and join.
 * Paths are the resource after `/web-api`.
 * Token list, create, and delete stay on the settings contract and on `/api/v1`.
 */
export const webAuthContract = oc.router({
  loginOptions: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/auth/login/options',
        summary: 'Get WebAuthn authentication options for passkey login',
      })
    )
    .input(emptyBody)
    .output(LoginOptionsResponseSchema),
  loginVerify: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/auth/login/verify',
        summary: 'Verify passkey and create session',
      })
    )
    .input(LoginVerifyRequestSchema)
    .output(LoginVerifyResponseSchema),
  logout: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/auth/logout',
        summary: 'Logout and revoke current session',
      })
    )
    .input(absentOrEmptyBody)
    .output(LogoutResponseSchema),
  session: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/auth/session',
        summary: 'Get current session information',
      })
    )
    .output(SessionInfoResponseSchema),
  signupOptions: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/auth/signup/options',
        summary: 'Get WebAuthn registration options for signup',
      })
    )
    .input(SignupOptionsRequestSchema)
    .output(SignupOptionsResponseSchema),
  signupVerify: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/auth/signup/verify',
        successStatus: 201,
        summary: 'Complete signup with WebAuthn registration',
      })
    )
    .input(SignupVerifyRequestSchema)
    .output(SignupVerifyResponseSchema),
  validateInvitation: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/invitations/validate',
        summary: 'Validate an invitation code before accepting',
      })
    )
    .input(ValidateInvitationSchema)
    .output(InvitationSchema),
  acceptInvitation: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/invitations/accept',
        summary: 'Accept an invitation and join the organization',
      })
    )
    .input(AcceptInvitationSchema)
    .output(InvitationSchema),
  registerPasskeyOptions: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/auth/passkey/register/options',
        summary: 'Get WebAuthn registration options for adding a passkey',
      })
    )
    .input(emptyBody)
    .output(PasskeyRegisterOptionsResponseSchema),
  registerPasskey: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/auth/passkey/register/verify',
        successStatus: 201,
        summary: 'Complete passkey registration with WebAuthn response',
      })
    )
    .input(PasskeyRegisterVerifyRequestSchema)
    .output(PasskeyRegisterVerifyResponseSchema),
  listPasskeys: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/auth/passkey/credentials',
        summary: 'List passkey credentials for the current user',
      })
    )
    .output(PasskeyCredentialsListResponseSchema),
  deletePasskey: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/auth/passkey/credentials/{credentialId}',
        summary: 'Delete a passkey credential',
      })
    )
    .input(credentialId)
    .output(PasskeyDeleteResponseSchema),
});
