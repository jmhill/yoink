import { err, ok, type Result } from 'neverthrow';
import type { RemoveMember } from './membership-commands.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { MemberLeft, MemberRemoved } from './membership-events.js';
import { isAdminRole, lastAdminBlocksChange } from './membership-roles.js';
import { decideOwnerRemains, membershipsWithout } from './owner-presence.js';
import {
  cannotLeavePersonalOrgError,
  cannotRemoveSelfError,
  lastAdminError,
  membershipNotFoundError,
  ownerCannotBeRemovedError,
  removeNotAllowedError,
  type CannotLeavePersonalOrgError,
  type CannotRemoveSelfError,
  type LastAdminError,
  type MembershipNotFoundError,
  type OwnerCannotBeRemovedError,
  type OwnerMustTransferError,
  type RemoveNotAllowedError,
} from './organization-errors.js';

export type DecideRemoveMemberInput = {
  command: RemoveMember;
  members: readonly OrganizationMembership[];
  eventId: string;
  now: string;
};

export type RemoveMemberPlan = {
  membership: OrganizationMembership;
  event: MemberRemoved | MemberLeft;
};

export type RemoveMemberError =
  | MembershipNotFoundError
  | CannotRemoveSelfError
  | CannotLeavePersonalOrgError
  | OwnerCannotBeRemovedError
  | RemoveNotAllowedError
  | OwnerMustTransferError
  | LastAdminError;

const decideRemoveOthersPermission = (
  actor: OrganizationMembership | null
): Result<void, RemoveNotAllowedError> => {
  if (actor === null || !isAdminRole(actor.role)) {
    return err(removeNotAllowedError());
  }
  return ok(undefined);
};

const removalEvent = (
  command: RemoveMember,
  membership: OrganizationMembership,
  eventId: string,
  now: string
): MemberRemoved | MemberLeft => {
  if (command.by.kind === 'self') {
    return {
      type: 'MemberLeft',
      id: eventId,
      organizationId: membership.organizationId,
      userId: membership.userId,
      role: membership.role,
      occurredAt: now,
    };
  }
  return {
    type: 'MemberRemoved',
    id: eventId,
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    actorUserId: command.by.userId,
    occurredAt: now,
  };
};

/**
 * Leave or remove. Order: target not found, target is the caller,
 * personal workspace, target is the owner, permission, decideOwnerRemains,
 * lastAdminBlocksChange. A member remover whose userId equals the target
 * is CANNOT_REMOVE_SELF, never a leave.
 */
export const decideRemoveMember = ({
  command,
  members,
  eventId,
  now,
}: DecideRemoveMemberInput): Result<RemoveMemberPlan, RemoveMemberError> => {
  const membership = members.find((entry) => entry.userId === command.userId) ?? null;
  if (!membership) {
    return err(
      membershipNotFoundError({ userId: command.userId, organizationId: command.organizationId })
    );
  }

  if (command.by.kind === 'member' && command.by.userId === command.userId) {
    return err(cannotRemoveSelfError());
  }

  if (membership.isPersonalOrg) {
    return err(cannotLeavePersonalOrgError(membership.userId, membership.organizationId));
  }

  if (command.by.kind === 'member' && membership.role === 'owner') {
    return err(ownerCannotBeRemovedError(membership.organizationId, membership.userId));
  }

  const remover = command.by;
  if (remover.kind === 'member') {
    const actor = members.find((entry) => entry.userId === remover.userId) ?? null;
    const permission = decideRemoveOthersPermission(actor);
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

  return ok({
    membership,
    event: removalEvent(command, membership, eventId, now),
  });
};
