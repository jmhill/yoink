import { err, ok, type Result } from 'neverthrow';
import type { RemoveMemberCommand } from './membership-commands.js';
import type { OrganizationMembership } from './organization-membership.js';
import { lastAdminBlocksChange } from './membership-roles.js';
import { decideOwnerRemains, membershipsWithout } from './owner-presence.js';
import {
  cannotLeavePersonalOrgError,
  insufficientPermissionsError,
  lastAdminError,
  membershipNotFoundError,
  ownerCannotBeRemovedError,
  type CannotLeavePersonalOrgError,
  type InsufficientPermissionsError,
  type LastAdminError,
  type MembershipNotFoundError,
  type OwnerCannotBeRemovedError,
  type OwnerMustTransferError,
} from './organization-errors.js';

export type DecideRemoveMemberInput = {
  command: RemoveMemberCommand;
  members: readonly OrganizationMembership[];
};

export type RemoveMemberPlan = {
  membership: OrganizationMembership;
};

export type DecideRemoveMemberError =
  | MembershipNotFoundError
  | CannotLeavePersonalOrgError
  | OwnerCannotBeRemovedError
  | OwnerMustTransferError
  | LastAdminError
  | InsufficientPermissionsError;

const decideRemoveOthersPermission = (
  actor: OrganizationMembership,
  target: OrganizationMembership
): Result<void, InsufficientPermissionsError> => {
  if (actor.role === 'member') {
    return err(insufficientPermissionsError('admin', actor.role));
  }
  if (actor.role === 'admin' && target.role !== 'member') {
    return err(insufficientPermissionsError('owner', actor.role));
  }
  return ok(undefined);
};

/**
 * Leave or remove. Removing the owner (anyone) is OWNER_CANNOT_BE_REMOVED
 * before permission. Permission is first for everything else, so a member
 * removing a last-admin still gets INSUFFICIENT_PERMISSIONS. Owner leave
 * is decideOwnerRemains → OWNER_MUST_TRANSFER. Last-admin only on
 * ownerless workspaces — once an owner exists, zero admins is allowed.
 */
export const decideRemoveMember = ({
  command,
  members,
}: DecideRemoveMemberInput): Result<RemoveMemberPlan, DecideRemoveMemberError> => {
  const membership = members.find((entry) => entry.userId === command.userId) ?? null;
  if (!membership) {
    return err(
      membershipNotFoundError({ userId: command.userId, organizationId: command.organizationId })
    );
  }

  if (membership.isPersonalOrg) {
    return err(cannotLeavePersonalOrgError(membership.userId, membership.organizationId));
  }

  const actorUserId = command.actorUserId;
  const isLeave = actorUserId === undefined || actorUserId === command.userId;
  if (!isLeave && membership.role === 'owner') {
    return err(ownerCannotBeRemovedError(membership.organizationId, membership.userId));
  }

  if (!isLeave) {
    const actor = members.find((entry) => entry.userId === actorUserId) ?? null;
    if (!actor) {
      return err(insufficientPermissionsError('member', 'none'));
    }
    const permission = decideRemoveOthersPermission(actor, membership);
    if (permission.isErr()) {
      return err(permission.error);
    }
  }

  const ownerCheck = decideOwnerRemains(members, membershipsWithout(members, membership.userId));
  if (ownerCheck.isErr()) {
    return err(ownerCheck.error);
  }

  if (lastAdminBlocksChange(membership, members)) {
    return err(lastAdminError(membership.organizationId));
  }

  return ok({ membership });
};
