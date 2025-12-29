import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  LoginOptionsResponseSchema,
  LoginVerifyRequestSchema,
  LoginVerifyResponseSchema,
  LogoutResponseSchema,
  SessionInfoResponseSchema,
} from '../schemas/auth.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

export const authContract = c.router({
  /**
   * Get WebAuthn authentication options for passkey login.
   * Uses discoverable credentials (empty allowCredentials).
   * Public endpoint - no auth required.
   */
  loginOptions: {
    method: 'POST',
    path: '/api/auth/login/options',
    body: z.object({}), // Empty body - discoverable credentials
    responses: {
      200: LoginOptionsResponseSchema,
      500: ErrorSchema,
    },
    summary: 'Get WebAuthn authentication options for passkey login',
  },

  /**
   * Verify passkey authentication response and create session.
   * Sets session cookie on success.
   * Public endpoint - no auth required.
   */
  loginVerify: {
    method: 'POST',
    path: '/api/auth/login/verify',
    body: LoginVerifyRequestSchema,
    responses: {
      200: LoginVerifyResponseSchema,
      400: ErrorSchema, // Invalid request or verification failed
      401: ErrorSchema, // Authentication failed (credential not found)
      410: ErrorSchema, // Challenge expired
      500: ErrorSchema,
    },
    summary: 'Verify passkey and create session',
  },

  /**
   * Logout - revoke current session.
   * Clears session cookie.
   * Requires session auth.
   */
  logout: {
    method: 'POST',
    path: '/api/auth/logout',
    body: z.undefined(),
    responses: {
      200: LogoutResponseSchema,
      401: ErrorSchema, // Not authenticated
      500: ErrorSchema,
    },
    summary: 'Logout and revoke current session',
  },

  /**
   * Get current session information.
   * Returns user info and current organization.
   * Requires auth (token or session).
   */
  session: {
    method: 'GET',
    path: '/api/auth/session',
    responses: {
      200: SessionInfoResponseSchema,
      401: ErrorSchema, // Not authenticated
      500: ErrorSchema,
    },
    summary: 'Get current session information',
  },
}, {
  strictStatusCodes: true,
});
