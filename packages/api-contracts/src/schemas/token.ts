import { z } from 'zod';

/**
 * Token schemas for user self-service token management.
 *
 * Tokens are scoped to organizations.
 */

export const TokenInfoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).nullable(),
  lastUsedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

export type TokenInfo = z.infer<typeof TokenInfoSchema>;

export const CreateUserTokenRequestSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateUserTokenRequest = z.infer<typeof CreateUserTokenRequestSchema>;

export const CreateUserTokenResponseSchema = z.object({
  token: TokenInfoSchema,
  rawToken: z.string(),
});

export type CreateUserTokenResponse = z.infer<typeof CreateUserTokenResponseSchema>;

export const ListUserTokensResponseSchema = z.object({
  tokens: z.array(TokenInfoSchema),
});

export type ListUserTokensResponse = z.infer<typeof ListUserTokensResponseSchema>;

export const DeleteUserTokenResponseSchema = z.object({
  success: z.literal(true),
});

export type DeleteUserTokenResponse = z.infer<typeof DeleteUserTokenResponseSchema>;

export const ReissueAgentTokenResponseSchema = z.object({
  token: TokenInfoSchema,
  rawToken: z.string(),
});

export type ReissueAgentTokenResponse = z.infer<typeof ReissueAgentTokenResponseSchema>;
