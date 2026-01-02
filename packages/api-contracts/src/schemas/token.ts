import { z } from 'zod';

/**
 * Token schemas for user self-service token management.
 *
 * These are used by authenticated users to manage their own API tokens.
 * Tokens are scoped to organizations - users can have up to 2 tokens per org.
 */

// Token info returned to the user (no hash, no full secret)
export const TokenInfoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  lastUsedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

export type TokenInfo = z.infer<typeof TokenInfoSchema>;

// Request to create a new token
export const CreateUserTokenRequestSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateUserTokenRequest = z.infer<typeof CreateUserTokenRequestSchema>;

// Response when creating a token - includes the raw token value (shown once)
export const CreateUserTokenResponseSchema = z.object({
  token: TokenInfoSchema,
  rawToken: z.string(), // The full tokenId:secret value (only shown once)
});

export type CreateUserTokenResponse = z.infer<typeof CreateUserTokenResponseSchema>;

// Response for listing tokens
export const ListUserTokensResponseSchema = z.object({
  tokens: z.array(TokenInfoSchema),
});

export type ListUserTokensResponse = z.infer<typeof ListUserTokensResponseSchema>;

// Response for deleting a token
export const DeleteUserTokenResponseSchema = z.object({
  success: z.literal(true),
});

export type DeleteUserTokenResponse = z.infer<typeof DeleteUserTokenResponseSchema>;
