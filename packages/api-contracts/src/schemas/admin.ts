import { z } from 'zod';

// Organization schemas
export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
});

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
});

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
});

export type Organization = z.infer<typeof OrganizationSchema>;
export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof UpdateOrganizationSchema>;

// User schemas
export const UserSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});

export const CreateUserSchema = z.object({
  email: z.string().email(),
});

export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;

// Token schemas (note: we don't expose tokenHash to the client)
export const ApiTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  lastUsedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

export const CreateTokenSchema = z.object({
  name: z.string().min(1).max(100),
});

// Response when creating a token - includes the raw token value
export const CreateTokenResponseSchema = z.object({
  token: ApiTokenSchema,
  rawToken: z.string(), // The full tokenId:secret value (only shown once)
});

export type ApiToken = z.infer<typeof ApiTokenSchema>;
export type CreateToken = z.infer<typeof CreateTokenSchema>;
export type CreateTokenResponse = z.infer<typeof CreateTokenResponseSchema>;

// Admin session schemas
export const LoginRequestSchema = z.object({
  password: z.string().min(1),
});

export const LoginResponseSchema = z.object({
  success: z.boolean(),
});

export const SessionResponseSchema = z.object({
  authenticated: z.boolean(),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
