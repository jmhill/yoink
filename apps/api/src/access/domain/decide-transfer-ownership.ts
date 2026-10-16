import { err, type Result } from 'neverthrow';
import type { TransferOwnershipCommand } from './membership-commands.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { User } from './user.js';
import { decideSetOwner, type DecideSetOwnerError } from './decide-set-owner.js';
import { ownerOf, type OwnershipTransferred } from './owner-presence.js';
import { notCurrentOwnerError, type NotCurrentOwnerError } from './organization-errors.js';

export type DecideTransferOwnershipInput = {
  command: TransferOwnershipCommand;
  members: readonly OrganizationMembership[];
  targetUser: User | null;
};

export type TransferError = DecideSetOwnerError | NotCurrentOwnerError;

/**
 * #190 shape: current owner names the next owner. Reuses decideSetOwner
 * (and therefore decideOwnerRemains + planOwnershipTransfer).
 */
export const decideTransferOwnership = ({
  command,
  members,
  targetUser,
}: DecideTransferOwnershipInput): Result<OwnershipTransferred, TransferError> => {
  const currentOwner = ownerOf(members);
  if (!currentOwner || currentOwner.userId !== command.fromUserId) {
    return err(notCurrentOwnerError(command.organizationId, command.fromUserId));
  }

  return decideSetOwner({
    command: { organizationId: command.organizationId, userId: command.toUserId },
    members,
    targetUser,
  });
};
