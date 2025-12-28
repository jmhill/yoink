import { initContract } from '@ts-rest/core';
import {
  SignupOptionsRequestSchema,
  SignupOptionsResponseSchema,
  SignupVerifyRequestSchema,
  SignupVerifyResponseSchema,
} from '../schemas/signup.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

export const signupContract = c.router({
  /**
   * Get WebAuthn registration options for signup.
   * Validates the invitation code and returns registration options.
   * Public endpoint - no auth required.
   */
  options: {
    method: 'POST',
    path: '/api/auth/signup/options',
    body: SignupOptionsRequestSchema,
    responses: {
      200: SignupOptionsResponseSchema,
      400: ErrorSchema, // Invalid email format
      404: ErrorSchema, // Invitation not found
      409: ErrorSchema, // Email already registered
      410: ErrorSchema, // Invitation expired or already used
      500: ErrorSchema,
    },
    summary: 'Get WebAuthn registration options for signup',
  },

  /**
   * Complete signup with WebAuthn registration response.
   * Creates user, personal org, memberships, passkey credential, and session.
   * Sets session cookie on success.
   * Public endpoint - no auth required.
   */
  verify: {
    method: 'POST',
    path: '/api/auth/signup/verify',
    body: SignupVerifyRequestSchema,
    responses: {
      201: SignupVerifyResponseSchema,
      400: ErrorSchema, // Invalid request or verification failed
      404: ErrorSchema, // Invitation not found
      409: ErrorSchema, // Email already registered
      410: ErrorSchema, // Invitation expired, already used, or challenge expired
      500: ErrorSchema,
    },
    summary: 'Complete signup with WebAuthn registration',
  },
}, {
  strictStatusCodes: true,
});
