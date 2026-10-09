import { z } from 'zod';

/**
 * Token schemas for user self-service token management.
 *
 * Tokens are scoped to organizations. Existing tokens may be unnamed
 * (name is null) until they are named once.
 */

export const TokenOwnerSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().nullable(),
  kind: z.enum(['human', 'agent']),
});

export type TokenOwner = z.infer<typeof TokenOwnerSchema>;

export const TokenInfoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).nullable(),
  lastUsedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  owner: TokenOwnerSchema,
});

export type TokenInfo = z.infer<typeof TokenInfoSchema>;

export const CreateUserTokenRequestSchema = z.object({
  name: z.string(),
});

export type CreateUserTokenRequest = z.infer<typeof CreateUserTokenRequestSchema>;

export const RenameUserTokenRequestSchema = z.object({
  name: z.string(),
});

export type RenameUserTokenRequest = z.infer<typeof RenameUserTokenRequestSchema>;

export const CreateUserTokenResponseSchema = z.object({
  token: TokenInfoSchema,
  rawToken: z.string(),
});

export type CreateUserTokenResponse = z.infer<typeof CreateUserTokenResponseSchema>;

export const ListUserTokensResponseSchema = z.object({
  tokens: z.array(TokenInfoSchema),
  maxTokensPerUser: z.number().int().positive(),
  ownedCount: z.number().int().nonnegative(),
});

export type ListUserTokensResponse = z.infer<typeof ListUserTokensResponseSchema>;

export const DeleteUserTokenResponseSchema = z.object({
  success: z.literal(true),
});

export type DeleteUserTokenResponse = z.infer<typeof DeleteUserTokenResponseSchema>;
