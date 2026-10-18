import { err, ok, type Result } from 'neverthrow';
import type { TransferOwnership } from './membership-commands.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { PrincipalKind, User } from './user.js';
import { decideSetOwner, type DecideSetOwnerError } from './decide-set-owner.js';
import { ownerOf, type OwnershipTransferPlan } from './owner-presence.js';
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

export type TransferOwnershipDecision = {
  plan: OwnershipTransferPlan;
  event: OwnershipTransferred;
};

const isPersonalWorkspace = (members: readonly OrganizationMembership[]): boolean =>
  members.some((membership) => membership.isPersonalOrg);

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

  if (isPersonalWorkspace(members)) {
    return err(personalWorkspaceTransferError(command.organizationId));
  }

  if (command.toUserId === command.fromUserId) {
    return err(alreadyOwnerError(command.fromUserId));
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
    plan: setOwner.value,
    event: {
      type: 'OwnershipTransferred',
      id: eventId,
      organizationId: command.organizationId,
      fromUserId: command.fromUserId,
      toUserId: command.toUserId,
      actorUserId: command.fromUserId,
      occurredAt: now,
    },
  });
};
