import { err, ok, type Result } from 'neverthrow';
import type { ChangeMemberRole } from './membership-commands.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { PrincipalKind } from './user.js';
import type { MemberRoleChanged } from './membership-events.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import { isAdminRole, lastAdminBlocksChange } from './membership-roles.js';
import { decideOwnerRemains, membershipsWithRole } from './owner-presence.js';
import {
  botCannotChangeRolesError,
  cannotAssignOwnerRoleError,
  cannotChangeOwnRoleError,
  lastAdminError,
  membershipNotFoundError,
  ownerRoleLockedError,
  roleChangeNotAllowedError,
  type BotCannotChangeRolesError,
  type BotCannotHavePrivilegedRoleError,
  type CannotAssignOwnerRoleError,
  type CannotChangeOwnRoleError,
  type LastAdminError,
  type MembershipNotFoundError,
  OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE,
  type OwnerMustTransferError,
  type OwnerRoleLockedError,
  type RoleChangeNotAllowedError,
} from './organization-errors.js';

export type DecideChangeMemberRoleInput = {
  command: ChangeMemberRole;
  members: readonly OrganizationMembership[];
  targetKind: PrincipalKind;
  eventId: string;
  now: string;
};

export type ChangeMemberRoleDecision =
  | { kind: 'changed'; membership: OrganizationMembership; event: MemberRoleChanged }
  | { kind: 'unchanged'; membership: OrganizationMembership };

export type ChangeMemberRoleError =
  | BotCannotChangeRolesError
  | MembershipNotFoundError
  | RoleChangeNotAllowedError
  | CannotChangeOwnRoleError
  | OwnerRoleLockedError
  | CannotAssignOwnerRoleError
  | BotCannotHavePrivilegedRoleError
  | OwnerMustTransferError
  | LastAdminError;

const decideRoleChangePermission = (
  command: ChangeMemberRole,
  members: readonly OrganizationMembership[]
): Result<
  void,
  | BotCannotChangeRolesError
  | MembershipNotFoundError
  | RoleChangeNotAllowedError
  | CannotChangeOwnRoleError
> => {
  const changer = command.by;
  if (changer.kind === 'app-admin') {
    return ok(undefined);
  }

  if (changer.principalKind === 'agent' || changer.via !== 'session') {
    return err(botCannotChangeRolesError());
  }

  const caller = members.find((entry) => entry.userId === changer.userId) ?? null;
  if (!caller) {
    return err(
      membershipNotFoundError({
        userId: changer.userId,
        organizationId: command.organizationId,
      })
    );
  }

  if (!isAdminRole(caller.role)) {
    return err(roleChangeNotAllowedError());
  }

  if (command.userId === changer.userId) {
    return err(cannotChangeOwnRoleError());
  }

  return ok(undefined);
};

const roleChangedActor = (
  by: ChangeMemberRole['by']
): MemberRoleChanged['actor'] => {
  if (by.kind === 'app-admin') {
    return { kind: 'app-admin' };
  }
  return { kind: 'member', userId: by.userId };
};

/**
 * Member/admin switch. Never assigns `owner` (use set-owner / transfer).
 * In-app caller: bot/token, membership, permission, own-role, then target.
 * App-admin caller skips those and OWNER_ROLE_LOCKED; owner-as-target
 * still hits decideOwnerRemains → OWNER_MUST_TRANSFER.
 */
export const decideChangeMemberRole = ({
  command,
  members,
  targetKind,
  eventId,
  now,
}: DecideChangeMemberRoleInput): Result<ChangeMemberRoleDecision, ChangeMemberRoleError> => {
  const permission = decideRoleChangePermission(command, members);
  if (permission.isErr()) {
    return err(permission.error);
  }

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

  if (command.by.kind === 'member' && membership.role === 'owner') {
    return err(ownerRoleLockedError(membership.organizationId, membership.userId));
  }

  if (command.newRole === 'owner') {
    return err(cannotAssignOwnerRoleError());
  }

  const botCheck = decideBotMayHaveRole(targetKind, command.newRole);
  if (botCheck.isErr()) {
    return err(botCheck.error);
  }

  if (membership.role === command.newRole) {
    return ok({ kind: 'unchanged', membership });
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
    kind: 'changed',
    membership: {
      ...membership,
      role: command.newRole,
    },
    event: {
      type: 'MemberRoleChanged',
      id: eventId,
      organizationId: command.organizationId,
      userId: command.userId,
      fromRole: membership.role,
      toRole: command.newRole,
      actor: roleChangedActor(command.by),
      occurredAt: now,
    },
  });
};
