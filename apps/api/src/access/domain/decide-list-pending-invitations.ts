import type { Invitation } from './invitation.js';

export type ListPendingInvitationsQuery = {
  readonly organizationId: string;
};

/**
 * The pending query goes in. Owner invites stay out of the in-app list.
 * The store already dropped accepted, replaced, and expired rows.
 */
export const selectInAppPendingInvitations = (
  invitations: readonly Invitation[]
): Invitation[] => invitations.filter((invitation) => invitation.role !== 'owner');
