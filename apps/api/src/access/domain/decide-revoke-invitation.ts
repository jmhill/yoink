import { err, ok, type Result } from 'neverthrow';
import type { RevokeInvitationPlan } from './invitation-plan.js';
import type { Invitation } from './invitation.js';
import {
  insufficientInvitePermissionsError,
  invitationNotFoundError,
  ownerInvitationAdminOnlyError,
  type InsufficientInvitePermissionsError,
  type InvitationNotFoundError,
  type OwnerInvitationAdminOnlyError,
} from './invitation-errors.js';
import type { MembershipRole } from './organization-membership.js';

export type RevokeInvitationCommand = {
  readonly invitationId: string;
  /** The user revoking the invitation. Used for the permission check. */
  readonly revokedByUserId: string;
};

/** The invitation query, after it is present and not an owner invite. */
export type RevokeInvitationDecision = {
  readonly organizationId: string;
};

/** The membership query only needs the role that gates revoke. */
export type RevokeInvitationMembership = {
  readonly role: MembershipRole;
} | null;

export type DecideRevokeInvitationError = InvitationNotFoundError | OwnerInvitationAdminOnlyError;

export type DecideRevokeInvitationMembershipError = InsufficientInvitePermissionsError;

/**
 * The invitation query goes in. A missing invite is refused before an owner
 * invite, and both are refused before the membership is loaded.
 */
export const decideRevokeInvitation = (input: {
  readonly command: RevokeInvitationCommand;
  readonly invitation: Invitation | null;
}): Result<RevokeInvitationDecision, DecideRevokeInvitationError> => {
  if (!input.invitation) {
    return err(invitationNotFoundError({ invitationId: input.command.invitationId }));
  }
  if (input.invitation.role === 'owner') {
    return err(ownerInvitationAdminOnlyError(input.command.invitationId));
  }
  return ok({ organizationId: input.invitation.organizationId });
};

/** The membership query goes in. Owner and admin may revoke. A member may not. */
export const decideRevokeInvitationMembership = (input: {
  readonly membership: RevokeInvitationMembership;
}): Result<void, DecideRevokeInvitationMembershipError> => {
  if (!input.membership || (input.membership.role !== 'admin' && input.membership.role !== 'owner')) {
    return err(insufficientInvitePermissionsError('admin', input.membership?.role ?? 'none'));
  }
  return ok(undefined);
};

/** Delete that invitation. The plan has no membership. */
export const planRevokeInvitation = (input: {
  readonly invitationId: string;
}): RevokeInvitationPlan => ({
  kind: 'revoke-invitation',
  invitationId: input.invitationId,
});
