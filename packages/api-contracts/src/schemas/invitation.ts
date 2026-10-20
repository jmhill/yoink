import { z } from 'zod';

/**
 * Role stored on an invitation. Owner is allowed only on admin-issued
 * owner invites. In-app create stays admin | member.
 */
export const InvitationRoleSchema = z.enum(['owner', 'admin', 'member']);

export type InvitationRole = z.infer<typeof InvitationRoleSchema>;

/** In-app create: people inside a workspace cannot invite someone as owner. */
export const InAppInvitationRoleSchema = z.enum(['admin', 'member']);

export type InAppInvitationRole = z.infer<typeof InAppInvitationRoleSchema>;

/**
 * Schema for an invitation as returned by the API.
 */
export const InvitationSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(8).max(12),
  email: z.string().email().nullable(),
  organizationId: z.string().uuid(),
  organizationName: z.string().optional(), // Included when validating for display
  /** The user who created this invitation. Null for admin-created invitations. */
  invitedByUserId: z.string().uuid().nullable(),
  role: InvitationRoleSchema,
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  acceptedByUserId: z.string().uuid().nullable(),
  replacedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type Invitation = z.infer<typeof InvitationSchema>;

/**
 * Schema for creating a new in-app invitation. Owner is not allowed.
 */
export const CreateInvitationSchema = z.object({
  organizationId: z.string().uuid(),
  role: InAppInvitationRoleSchema.default('member'),
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

export const INVITATION_NOT_FOUND_MESSAGE = "This invite link isn't valid.";
export const INVITATION_EXPIRED_MESSAGE = 'This invite has expired. Ask for a new link.';
export const INVITATION_ALREADY_USED_MESSAGE = 'This invite has already been used.';
export const EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE =
  'That email already has an account. Sign in instead.';
export const INVITATION_REPLACED_MESSAGE = 'This invite was replaced. Ask for a new link.';
export const OWNER_INVITE_WRONG_EMAIL_MESSAGE = 'This invite is for a different email.';
export const INVITE_WRONG_EMAIL_HINT =
  'Sign in with that email, or ask for a new link.';
export const OWNER_INVITE_ADMIN_ONLY_MESSAGE =
  'Only the Yoink admin can change the owner invite.';
export const ACCEPT_INVITE_STORAGE_MESSAGE = "Couldn't accept the invite. Try again.";
export const YOUR_ROLE_OWNER_LABEL = 'Your role: Owner';

export const ownerInviteJoinTitle = (workspace: string): string =>
  `You've been invited to own ${workspace}`;
