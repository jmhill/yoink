import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import {
  CreateUserTokenRequestSchema,
  CreateUserTokenResponseSchema,
  DeleteUserTokenResponseSchema,
  ListUserTokensResponseSchema,
} from '../schemas/token.js';

const tokenId = z.object({
  tokenId: z.string(),
});

export const tokenOrpcContract = oc.router({
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/auth/tokens',
        summary: 'List API tokens for the current user and organization',
      })
    )
    .output(ListUserTokensResponseSchema),
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/auth/tokens',
        successStatus: 201,
        summary: 'Create a new API token',
      })
    )
    .input(CreateUserTokenRequestSchema)
    .output(CreateUserTokenResponseSchema),
  delete: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/api/auth/tokens/{tokenId}',
        summary: 'Delete an API token',
      })
    )
    .input(tokenId)
    .output(DeleteUserTokenResponseSchema),
});
