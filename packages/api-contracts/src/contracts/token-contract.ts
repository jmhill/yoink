import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  CreateUserTokenRequestSchema,
  CreateUserTokenResponseSchema,
  ListUserTokensResponseSchema,
  DeleteUserTokenResponseSchema,
} from '../schemas/token.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

/**
 * User token management contract.
 *
 * Allows authenticated users to manage their own API tokens for the current organization.
 * Tokens are used for extension/CLI access.
 *
 * Limits:
 * - Maximum 2 tokens per user per organization (to allow for token rotation)
 */
export const tokenContract = c.router({
  /**
   * List all tokens for the authenticated user in the current organization.
   * Requires auth (token or session).
   */
  list: {
    method: 'GET',
    path: '/api/auth/tokens',
    responses: {
      200: ListUserTokensResponseSchema,
      401: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'List API tokens for the current user and organization',
  },

  /**
   * Create a new API token for the authenticated user in the current organization.
   * Returns the raw token value (shown only once).
   * Requires auth (token or session).
   */
  create: {
    method: 'POST',
    path: '/api/auth/tokens',
    body: CreateUserTokenRequestSchema,
    responses: {
      201: CreateUserTokenResponseSchema,
      400: ErrorSchema, // Invalid request
      401: ErrorSchema,
      409: ErrorSchema, // Token limit reached (max 2 per user per org)
      500: ErrorSchema,
    },
    summary: 'Create a new API token',
  },

  /**
   * Delete (revoke) an API token.
   * Users can only delete their own tokens.
   * Requires auth (token or session).
   */
  delete: {
    method: 'DELETE',
    path: '/api/auth/tokens/:tokenId',
    pathParams: z.object({
      tokenId: z.string(),
    }),
    body: z.undefined(),
    responses: {
      200: DeleteUserTokenResponseSchema,
      401: ErrorSchema,
      403: ErrorSchema, // Not owner of token
      404: ErrorSchema, // Token not found
      500: ErrorSchema,
    },
    summary: 'Delete an API token',
  },
}, {
  strictStatusCodes: true,
});
