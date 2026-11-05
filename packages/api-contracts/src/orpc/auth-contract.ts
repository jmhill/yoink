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

const emptyBody = z.object({});

/** Logout sends no JSON body. A missing body arrives as null once path params are absent. */
const absentOrEmptyBody = z.union([emptyBody, z.null(), z.undefined()]);

export const authOrpcContract = oc.router({
  loginOptions: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/auth/login/options',
        summary: 'Get WebAuthn authentication options for passkey login',
      })
    )
    .input(emptyBody)
    .output(LoginOptionsResponseSchema),
  loginVerify: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/auth/login/verify',
        summary: 'Verify passkey and create session',
      })
    )
    .input(LoginVerifyRequestSchema)
    .output(LoginVerifyResponseSchema),
  logout: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/auth/logout',
        summary: 'Logout and revoke current session',
      })
    )
    .input(absentOrEmptyBody)
    .output(LogoutResponseSchema),
  session: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/auth/session',
        summary: 'Get current session information',
      })
    )
    .output(SessionInfoResponseSchema),
});
