import { z } from 'zod';

/**
 * Role for invitation - excludes 'owner' since that's only for personal orgs.
 */
export const InvitationRoleSchema = z.enum(['admin', 'member']);

export type InvitationRole = z.infer<typeof InvitationRoleSchema>;

/**
 * Schema for an invitation as returned by the API.
 */
export const InvitationSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(8).max(12),
  email: z.string().email().nullable(),
  organizationId: z.string().uuid(),
  organizationName: z.string().optional(), // Included when validating for display
  invitedByUserId: z.string().uuid(),
  role: InvitationRoleSchema,
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  acceptedByUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type Invitation = z.infer<typeof InvitationSchema>;

/**
 * Schema for creating a new invitation.
 */
export const CreateInvitationSchema = z.object({
  organizationId: z.string().uuid(),
  role: InvitationRoleSchema.default('member'),
  email: z.string().email().optional(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>;

/**
 * Schema for validating an invitation (before accepting).
 */
export const ValidateInvitationSchema = z.object({
  code: z.string().min(8).max(12),
  email: z.string().email().optional(),
});

export type ValidateInvitationInput = z.infer<typeof ValidateInvitationSchema>;

/**
 * Schema for accepting an invitation.
 */
export const AcceptInvitationSchema = z.object({
  code: z.string().min(8).max(12),
});

export type AcceptInvitationInput = z.infer<typeof AcceptInvitationSchema>;
