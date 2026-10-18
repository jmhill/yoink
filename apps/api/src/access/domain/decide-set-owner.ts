import { err, ok, type Result } from 'neverthrow';
import type { SetOwnerCommand } from './membership-commands.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Invitation } from './invitation.js';
import { markInvitationReplaced } from './invitation.js';
import type { OwnerAssigned } from './membership-events.js';
import { principalKindOf, type User } from './user.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import {
  decideOwnerRemains,
  membershipsWithRole,
  planOwnershipTransfer,
  type OwnershipTransferPlan,
} from './owner-presence.js';
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
  pendingOwnerInvitation: Invitation | null;
  eventId: string;
  now: string;
};

export type SetOwnerDecision = {
  plan: OwnershipTransferPlan;
  replaced: Invitation | null;
  event: OwnerAssigned;
};

export type DecideSetOwnerError =
  | UserNotFoundError
  | TargetNotWorkspaceMemberError
  | BotCannotHavePrivilegedRoleError
  | OwnerMustTransferError;

/**
 * Panel set-owner: target must be a human already in the workspace.
 * Old owner (if any) becomes admin in the same OwnershipTransferPlan.
 * A pending owner invite is marked replaced in the same save.
 */
export const decideSetOwner = ({
  command,
  members,
  targetUser,
  pendingOwnerInvitation,
  eventId,
  now,
}: DecideSetOwnerInput): Result<SetOwnerDecision, DecideSetOwnerError> => {
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

  const fromRole =
    targetMembership.role === 'owner' ? null : targetMembership.role;
  const event: OwnerAssigned = {
    type: 'OwnerAssigned',
    id: eventId,
    organizationId: command.organizationId,
    userId: command.userId,
    fromRole,
    previousOwnerUserId: plan.demote?.userId ?? null,
    actor: { kind: 'app-admin' },
    occurredAt: now,
  };

  return ok({
    plan,
    replaced:
      pendingOwnerInvitation === null
        ? null
        : markInvitationReplaced(pendingOwnerInvitation, now),
    event,
  });
};
