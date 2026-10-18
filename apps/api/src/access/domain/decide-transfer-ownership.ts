import { err, ok, type Result } from 'neverthrow';
import type { TransferOwnership } from './membership-commands.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { PrincipalKind, User } from './user.js';
import { decideSetOwner, type DecideSetOwnerError } from './decide-set-owner.js';
import { ownerOf } from './owner-presence.js';
import type { OwnershipTransferred } from './membership-events.js';
import {
  alreadyOwnerError,
  botCannotTransferOwnershipError,
  notCurrentOwnerError,
  personalWorkspaceTransferError,
  type AlreadyOwnerError,
  type BotCannotTransferOwnershipError,
  type NotCurrentOwnerError,
  type PersonalWorkspaceTransferError,
} from './organization-errors.js';
import { userNotFoundError } from './user-errors.js';

export type DecideTransferOwnershipInput = {
  command: TransferOwnership;
  members: readonly OrganizationMembership[];
  targetUser: User | null;
  actorKind: PrincipalKind;
  eventId: string;
  now: string;
};

export type TransferOwnershipError =
  | BotCannotTransferOwnershipError
  | NotCurrentOwnerError
  | PersonalWorkspaceTransferError
  | AlreadyOwnerError
  | DecideSetOwnerError;

/** Handover always names the outgoing owner; demote is never null. */
export type HandoverOwnershipPlan = {
  demote: OrganizationMembership;
  promote: OrganizationMembership;
};

export type TransferOwnershipDecision = {
  plan: HandoverOwnershipPlan;
  event: OwnershipTransferred;
  nextOwner: User;
};

/**
 * Current owner names the next owner. Checks run in this order, then
 * decideSetOwner (user, bot-as-owner, not-a-member, decideOwnerRemains).
 */
export const decideTransferOwnership = ({
  command,
  members,
  targetUser,
  actorKind,
  eventId,
  now,
}: DecideTransferOwnershipInput): Result<TransferOwnershipDecision, TransferOwnershipError> => {
  if (actorKind === 'agent') {
    return err(botCannotTransferOwnershipError());
  }

  const currentOwner = ownerOf(members);
  if (!currentOwner || currentOwner.userId !== command.fromUserId) {
    return err(notCurrentOwnerError(command.organizationId, command.fromUserId));
  }

  if (currentOwner.isPersonalOrg) {
    return err(personalWorkspaceTransferError(command.organizationId));
  }

  if (command.toUserId === command.fromUserId) {
    return err(alreadyOwnerError(command.fromUserId));
  }

  if (targetUser === null) {
    return err(userNotFoundError(command.toUserId));
  }

  const setOwner = decideSetOwner({
    command: { organizationId: command.organizationId, userId: command.toUserId },
    members,
    targetUser,
  });
  if (setOwner.isErr()) {
    return err(setOwner.error);
  }

  return ok({
    plan: {
      demote: { ...currentOwner, role: 'admin' },
      promote: setOwner.value.promote,
    },
    event: {
      type: 'OwnershipTransferred',
      id: eventId,
      organizationId: command.organizationId,
      fromUserId: command.fromUserId,
      toUserId: command.toUserId,
      actorUserId: command.fromUserId,
      occurredAt: now,
    },
    nextOwner: targetUser,
  });
};
