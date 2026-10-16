import { err, ok, type Result } from 'neverthrow';
import type { ChangeRoleCommand } from './membership-commands.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { PrincipalKind } from './user.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import { isAdminRole, lastAdminBlocksChange } from './membership-roles.js';
import { decideOwnerRemains, membershipsWithRole } from './owner-presence.js';
import {
  cannotAssignOwnerRoleError,
  lastAdminError,
  membershipNotFoundError,
  type BotCannotHavePrivilegedRoleError,
  type CannotAssignOwnerRoleError,
  type LastAdminError,
  type MembershipNotFoundError,
  OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE,
  type OwnerMustTransferError,
} from './organization-errors.js';

export type DecideChangeRoleInput = {
  command: ChangeRoleCommand;
  members: readonly OrganizationMembership[];
  targetKind: PrincipalKind;
};

export type DecideChangeRoleError =
  | MembershipNotFoundError
  | BotCannotHavePrivilegedRoleError
  | CannotAssignOwnerRoleError
  | OwnerMustTransferError
  | LastAdminError;

/**
 * Member/admin switch. Never assigns `owner` (use set-owner / transfer).
 * Never-ownerless is decideOwnerRemains — same rule #190 reuses.
 */
export const decideChangeRole = ({
  command,
  members,
  targetKind,
}: DecideChangeRoleInput): Result<OrganizationMembership, DecideChangeRoleError> => {
  const membership =
    members.find((entry) => entry.userId === command.userId) ?? null;
  if (!membership) {
    return err(
      membershipNotFoundError({
        userId: command.userId,
        organizationId: command.organizationId,
      })
    );
  }

  const botCheck = decideBotMayHaveRole(targetKind, command.newRole);
  if (botCheck.isErr()) {
    return err(botCheck.error);
  }

  if (command.newRole === 'owner') {
    return err(cannotAssignOwnerRoleError());
  }

  const ownerCheck = decideOwnerRemains(
    members,
    membershipsWithRole(members, membership.userId, command.newRole)
  );
  if (ownerCheck.isErr()) {
    return err({
      ...ownerCheck.error,
      message: OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE,
    });
  }

  if (
    isAdminRole(membership.role) &&
    !isAdminRole(command.newRole) &&
    lastAdminBlocksChange(membership, members)
  ) {
    return err(lastAdminError(membership.organizationId));
  }

  return ok({
    ...membership,
    role: command.newRole,
  });
};
