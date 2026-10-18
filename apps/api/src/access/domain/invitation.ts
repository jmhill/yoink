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

export const OWNER_INVITE_EXPIRY_DAYS = 7;

export const ownerInvitationExpiresAt = (now: string): string =>
  new Date(Date.parse(now) + OWNER_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

/**
 * Represents an invitation to join an organization.
 *
 * Key design decisions:
 * - code: Short, unique code for sharing (8 alphanumeric chars)
 * - email: Optional restriction to specific email address; required for owner
 * - role: The role the invitee will get when joining the org
 * - expiresAt: Invitations have a TTL (default 7 days)
 * - acceptedAt/acceptedByUserId: Track when/who used the invitation
 * - replacedAt: New link / different email / Make owner marks the old row
 */
export const InvitationSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(8).max(12),
  email: z.string().email().nullable(),
  organizationId: z.string().uuid(),
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

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'replaced';

export const invitationStatus = (
  invitation: Invitation,
  now: string
): InvitationStatus => {
  if (invitation.replacedAt !== null) {
    return 'replaced';
  }
  if (invitation.acceptedAt !== null) {
    return 'accepted';
  }
  if (invitation.expiresAt <= now) {
    return 'expired';
  }
  return 'pending';
};

/**
 * Check if an invitation is valid (not expired, not accepted, not replaced).
 */
export const isInvitationValid = (
  invitation: Invitation,
  currentTime: string
): boolean => invitationStatus(invitation, currentTime) === 'pending';

/**
 * Check if an invitation is expired.
 */
export const isInvitationExpired = (
  invitation: Invitation,
  currentTime: string
): boolean => invitationStatus(invitation, currentTime) === 'expired';

/**
 * Check if an invitation has already been accepted.
 */
export const isInvitationAccepted = (invitation: Invitation): boolean => {
  return invitation.acceptedAt !== null;
};

export const isInvitationReplaced = (invitation: Invitation): boolean => {
  return invitation.replacedAt !== null;
};

export const markInvitationReplaced = (
  invitation: Invitation,
  now: string
): Invitation => ({
  ...invitation,
  replacedAt: now,
});

export const markInvitationAccepted = (
  invitation: Invitation,
  input: { now: string; userId: string }
): Invitation => ({
  ...invitation,
  acceptedAt: input.now,
  acceptedByUserId: input.userId,
});
