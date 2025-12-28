import { z } from 'zod';

/**
 * Role for invitation - excludes 'owner' since that's only for personal orgs.
 */
export const InvitationRoleSchema = z.enum(['admin', 'member']);

export type InvitationRole = z.infer<typeof InvitationRoleSchema>;

/**
 * Represents an invitation to join an organization.
 *
 * Key design decisions:
 * - code: Short, unique code for sharing (8 alphanumeric chars)
 * - email: Optional restriction to specific email address
 * - role: The role the invitee will get when joining the org
 * - expiresAt: Invitations have a TTL (default 7 days)
 * - acceptedAt/acceptedByUserId: Track when/who used the invitation
 */
export const InvitationSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(8).max(12),
  email: z.string().email().nullable(),
  organizationId: z.string().uuid(),
  invitedByUserId: z.string().uuid(),
  role: InvitationRoleSchema,
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  acceptedByUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type Invitation = z.infer<typeof InvitationSchema>;

/**
 * Check if an invitation is valid (not expired and not accepted).
 */
export const isInvitationValid = (
  invitation: Invitation,
  currentTime: string
): boolean => {
  return invitation.acceptedAt === null && invitation.expiresAt > currentTime;
};

/**
 * Check if an invitation is expired.
 */
export const isInvitationExpired = (
  invitation: Invitation,
  currentTime: string
): boolean => {
  return invitation.expiresAt <= currentTime;
};

/**
 * Check if an invitation has already been accepted.
 */
export const isInvitationAccepted = (invitation: Invitation): boolean => {
  return invitation.acceptedAt !== null;
};
