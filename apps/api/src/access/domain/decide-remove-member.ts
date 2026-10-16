import { err, ok, type Result } from 'neverthrow';
import type { OrganizationMembership } from './organization-membership.js';
import { lastAdminBlocksChange } from './membership-roles.js';
import {
  cannotLeavePersonalOrgError,
  lastAdminError,
  ownerMustTransferError,
  type CannotLeavePersonalOrgError,
  type LastAdminError,
  type OwnerMustTransferError,
} from './organization-errors.js';

export type DecideRemoveMemberInput = {
  membership: OrganizationMembership;
  allMembers: readonly OrganizationMembership[];
};

export type DecideRemoveMemberError =
  | CannotLeavePersonalOrgError
  | OwnerMustTransferError
  | LastAdminError;

/**
 * Whether a membership can be deleted. Owner cannot leave or be removed
 * (would leave the workspace ownerless). Personal-workspace rule is unchanged.
 */
export const decideRemoveMember = ({
  membership,
  allMembers,
}: DecideRemoveMemberInput): Result<void, DecideRemoveMemberError> => {
  if (membership.isPersonalOrg) {
    return err(cannotLeavePersonalOrgError(membership.userId, membership.organizationId));
  }

  if (membership.role === 'owner') {
    return err(ownerMustTransferError(membership.organizationId, membership.userId));
  }

  if (lastAdminBlocksChange(membership, allMembers)) {
    return err(lastAdminError(membership.organizationId));
  }

  return ok(undefined);
};
