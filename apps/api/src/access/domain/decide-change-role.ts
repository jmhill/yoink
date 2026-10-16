import { err, ok, type Result } from 'neverthrow';
import type { MembershipRole, OrganizationMembership } from './organization-membership.js';
import type { PrincipalKind } from './user.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import { isAdminRole, lastAdminBlocksChange } from './membership-roles.js';
import {
  cannotAssignOwnerRoleError,
  cannotChangeOwnerRoleError,
  lastAdminError,
  type BotCannotHavePrivilegedRoleError,
  type CannotAssignOwnerRoleError,
  type CannotChangeOwnerRoleError,
  type LastAdminError,
} from './organization-errors.js';

export type DecideChangeRoleInput = {
  membership: OrganizationMembership;
  newRole: MembershipRole;
  targetKind: PrincipalKind;
  allMembers: readonly OrganizationMembership[];
};

export type DecideChangeRoleError =
  | BotCannotHavePrivilegedRoleError
  | CannotAssignOwnerRoleError
  | CannotChangeOwnerRoleError
  | LastAdminError;

/**
 * In-app and admin member/admin switch. Never assigns `owner` (use set-owner).
 * Never changes the current owner's role (that would leave the workspace ownerless).
 */
export const decideChangeRole = ({
  membership,
  newRole,
  targetKind,
  allMembers,
}: DecideChangeRoleInput): Result<OrganizationMembership, DecideChangeRoleError> => {
  const botCheck = decideBotMayHaveRole(targetKind, newRole);
  if (botCheck.isErr()) {
    return err(botCheck.error);
  }

  if (newRole === 'owner') {
    return err(cannotAssignOwnerRoleError());
  }

  if (membership.role === 'owner') {
    return err(cannotChangeOwnerRoleError(membership.id));
  }

  if (isAdminRole(membership.role) && !isAdminRole(newRole) && lastAdminBlocksChange(membership, allMembers)) {
    return err(lastAdminError(membership.organizationId));
  }

  return ok({
    ...membership,
    role: newRole,
  });
};
