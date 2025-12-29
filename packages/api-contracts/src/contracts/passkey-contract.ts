import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  PasskeyRegisterOptionsResponseSchema,
  PasskeyRegisterVerifyRequestSchema,
  PasskeyRegisterVerifyResponseSchema,
  PasskeyCredentialsListResponseSchema,
  PasskeyDeleteResponseSchema,
} from '../schemas/passkey.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

export const passkeyContract = c.router({
  /**
   * Get WebAuthn registration options for adding a new passkey.
   * Requires auth (token or session).
   */
  registerOptions: {
    method: 'POST',
    path: '/api/auth/passkey/register/options',
    body: z.object({}), // Empty body, uses auth context
    responses: {
      200: PasskeyRegisterOptionsResponseSchema,
      401: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Get WebAuthn registration options for adding a passkey',
  },

  /**
   * Complete passkey registration with WebAuthn response.
   * Saves credential, creates session, and sets session cookie.
   * Requires auth (token or session).
   */
  registerVerify: {
    method: 'POST',
    path: '/api/auth/passkey/register/verify',
    body: PasskeyRegisterVerifyRequestSchema,
    responses: {
      201: PasskeyRegisterVerifyResponseSchema,
      400: ErrorSchema, // Invalid request or verification failed
      401: ErrorSchema,
      410: ErrorSchema, // Challenge expired
      500: ErrorSchema,
    },
    summary: 'Complete passkey registration with WebAuthn response',
  },

  /**
   * List all passkey credentials for the authenticated user.
   * Requires auth (token or session).
   */
  listCredentials: {
    method: 'GET',
    path: '/api/auth/passkey/credentials',
    responses: {
      200: PasskeyCredentialsListResponseSchema,
      401: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'List passkey credentials for the current user',
  },

  /**
   * Delete a passkey credential.
   * Cannot delete the last passkey (returns 409).
   * Requires auth (token or session).
   */
  deleteCredential: {
    method: 'DELETE',
    path: '/api/auth/passkey/credentials/:credentialId',
    pathParams: z.object({
      credentialId: z.string(),
    }),
    body: z.undefined(),
    responses: {
      200: PasskeyDeleteResponseSchema,
      401: ErrorSchema,
      403: ErrorSchema, // Not owner of credential
      404: ErrorSchema, // Credential not found
      409: ErrorSchema, // Cannot delete last passkey
      500: ErrorSchema,
    },
    summary: 'Delete a passkey credential',
  },
}, {
  strictStatusCodes: true,
});
