import { z } from 'zod';

// Organization schemas
export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
});

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  ownerEmail: z.string().email(),
});

export const CreateWorkspaceRequestSchema = CreateOrganizationSchema;

export const OwnerInvitationSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  email: z.string().email(),
  expiresAt: z.string().datetime(),
});

export const IssueOwnerInvitationRequestSchema = z.object({
  email: z.string().email(),
});

export const WorkspaceOwnerStatusSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('has-owner'),
    ownerUserId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal('waiting-for-owner'),
    email: z.string().email(),
    expiresAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal('no-owner'),
    expiredInvite: z
      .object({
        email: z.string().email(),
        expiredAt: z.string().datetime(),
      })
      .nullable(),
  }),
]);

export const AdminWorkspaceListItemSchema = OrganizationSchema.extend({
  personal: z.boolean(),
  ownerStatus: WorkspaceOwnerStatusSchema,
});

export const ExpiredOwnerInvitationSchema = z.object({
  email: z.string().email(),
  expiredAt: z.string().datetime(),
});

export const GetOwnerInvitationResponseSchema = z.object({
  ownerInvitation: OwnerInvitationSummarySchema.nullable(),
  expiredOwnerInvitation: ExpiredOwnerInvitationSchema.nullable(),
});

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
});

export type Organization = z.infer<typeof OrganizationSchema>;
export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>;
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;
export type OwnerInvitationSummary = z.infer<typeof OwnerInvitationSummarySchema>;
export type IssueOwnerInvitationRequest = z.infer<typeof IssueOwnerInvitationRequestSchema>;
export type WorkspaceOwnerStatus = z.infer<typeof WorkspaceOwnerStatusSchema>;
export type AdminWorkspaceListItem = z.infer<typeof AdminWorkspaceListItemSchema>;
export type ExpiredOwnerInvitation = z.infer<typeof ExpiredOwnerInvitationSchema>;
export type GetOwnerInvitationResponse = z.infer<typeof GetOwnerInvitationResponseSchema>;
export type UpdateOrganization = z.infer<typeof UpdateOrganizationSchema>;

// User schemas
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  kind: z.enum(['human', 'agent']).optional(),
  role: z.enum(['owner', 'admin', 'member']).optional(),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateWorkspaceResponseSchema = z.object({
  organization: OrganizationSchema,
  owner: UserSchema.nullable(),
  ownerInvitation: OwnerInvitationSummarySchema.nullable(),
});

export const IssueOwnerInvitationResponseSchema = z.object({
  owner: UserSchema.nullable(),
  ownerInvitation: OwnerInvitationSummarySchema.nullable(),
});

export type CreateWorkspaceResponse = z.infer<typeof CreateWorkspaceResponseSchema>;
export type IssueOwnerInvitationResponse = z.infer<typeof IssueOwnerInvitationResponseSchema>;

export const SetOrganizationOwnerSchema = z.object({
  userId: z.string().uuid(),
});

export const PatchMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export type SetOrganizationOwner = z.infer<typeof SetOrganizationOwnerSchema>;
export type PatchMemberRole = z.infer<typeof PatchMemberRoleSchema>;

// Token schemas (note: we don't expose tokenHash to the client)
// Tokens are scoped to organizations
export const ApiTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  lastUsedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

// Creating a token requires userId in the body (org comes from URL).
export const CreateTokenSchema = z.object({
  userId: z.string().uuid(),
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

// Legacy export for backwards compatibility (to be removed)
export const CreateUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
  kind: z.enum(['human', 'agent']).optional(),
  name: z.string().min(1).max(100).optional(),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

export const UpdateProjectCreatedAtSchema = z.object({
  createdAt: z.string().datetime(),
});
export type UpdateProjectCreatedAt = z.infer<typeof UpdateProjectCreatedAtSchema>;

// Invitation schemas (admin can create invitations without being org member)
// organizationId comes from URL path params, not body
export const AdminCreateInvitationSchema = z.object({
  role: z.enum(['admin', 'member']).default('member'),
  email: z.string().email().optional(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export const AdminInvitationResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  email: z.string().email().nullable(),
  organizationId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'member']),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type AdminCreateInvitation = z.infer<typeof AdminCreateInvitationSchema>;
export type AdminInvitationResponse = z.infer<typeof AdminInvitationResponseSchema>;

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
