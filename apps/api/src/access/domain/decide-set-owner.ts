import { err, ok, type Result } from 'neverthrow';
import type { SetOwnerCommand } from './membership-commands.js';
import type { OrganizationMembership } from './organization-membership.js';
import { principalKindOf, type User } from './user.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import { decideOwnerRemains, membershipsWithRole, planOwnershipTransfer, type OwnershipTransferred } from './owner-presence.js';
import {
  targetNotWorkspaceMemberError,
  type BotCannotHavePrivilegedRoleError,
  type OwnerMustTransferError,
  type TargetNotWorkspaceMemberError,
} from './organization-errors.js';
import { userNotFoundError, type UserNotFoundError } from './user-errors.js';

export type DecideSetOwnerInput = {
  command: SetOwnerCommand;
  members: readonly OrganizationMembership[];
  targetUser: User | null;
};

export type DecideSetOwnerError =
  | UserNotFoundError
  | TargetNotWorkspaceMemberError
  | BotCannotHavePrivilegedRoleError
  | OwnerMustTransferError;

/**
 * Panel set-owner: target must be a human already in the workspace.
 * Old owner (if any) becomes admin in the same OwnershipTransferred plan.
 */
export const decideSetOwner = ({
  command,
  members,
  targetUser,
}: DecideSetOwnerInput): Result<OwnershipTransferred, DecideSetOwnerError> => {
  if (!targetUser) {
    return err(userNotFoundError(command.userId));
  }

  const botCheck = decideBotMayHaveRole(principalKindOf(targetUser), 'owner');
  if (botCheck.isErr()) {
    return err(botCheck.error);
  }

  const targetMembership = members.find((entry) => entry.userId === command.userId) ?? null;
  if (!targetMembership) {
    return err(targetNotWorkspaceMemberError(command.userId, command.organizationId));
  }

  const plan = planOwnershipTransfer(members, targetMembership);
  const next = plan.demote
    ? membershipsWithRole(
        membershipsWithRole(members, plan.demote.userId, plan.demote.role),
        plan.promote.userId,
        plan.promote.role
      )
    : membershipsWithRole(members, plan.promote.userId, plan.promote.role);
  const ownerCheck = decideOwnerRemains(members, next);
  if (ownerCheck.isErr()) {
    return err(ownerCheck.error);
  }

  return ok(plan);
};
