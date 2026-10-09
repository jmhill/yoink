import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  CreateUserTokenRequestSchema,
  CreateUserTokenResponseSchema,
  ListUserTokensResponseSchema,
  DeleteUserTokenResponseSchema,
  RenameUserTokenRequestSchema,
  TokenInfoSchema,
} from '../schemas/token.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

/**
 * User token management contract.
 *
 * Creating, renaming, and revoking tokens is human-session only.
 * Listing is available to any authenticated member, including bots.
 */
export const tokenContract = c.router({
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

  create: {
    method: 'POST',
    path: '/api/auth/tokens',
    body: CreateUserTokenRequestSchema,
    responses: {
      201: CreateUserTokenResponseSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      409: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Create a new API token',
  },

  rename: {
    method: 'PATCH',
    path: '/api/auth/tokens/:tokenId',
    pathParams: z.object({
      tokenId: z.string(),
    }),
    body: RenameUserTokenRequestSchema,
    responses: {
      200: TokenInfoSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
      409: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Name or rename an API token',
  },

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
      403: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Delete an API token',
  },
}, {
  strictStatusCodes: true,
});
