import { err, ok, type Result } from 'neverthrow';
import type { OrganizationMembership } from './organization-membership.js';
import { principalKindOf, type User } from './user.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import {
  targetNotWorkspaceMemberError,
  type BotCannotHavePrivilegedRoleError,
  type TargetNotWorkspaceMemberError,
} from './organization-errors.js';
import { userNotFoundError, type UserNotFoundError } from './user-errors.js';

export type SetOwnerPlan = {
  demote: OrganizationMembership | null;
  promote: OrganizationMembership;
};

export type DecideSetOwnerInput = {
  organizationId: string;
  targetUserId: string;
  targetUser: User | null;
  targetMembership: OrganizationMembership | null;
  currentOwner: OrganizationMembership | null;
};

export type DecideSetOwnerError =
  | UserNotFoundError
  | TargetNotWorkspaceMemberError
  | BotCannotHavePrivilegedRoleError;

/**
 * Panel set-owner: target must be a human already in the workspace.
 * Old owner (if any) becomes admin in the same save.
 */
export const decideSetOwner = ({
  organizationId,
  targetUserId,
  targetUser,
  targetMembership,
  currentOwner,
}: DecideSetOwnerInput): Result<SetOwnerPlan, DecideSetOwnerError> => {
  if (!targetUser) {
    return err(userNotFoundError(targetUserId));
  }

  const botCheck = decideBotMayHaveRole(principalKindOf(targetUser), 'owner');
  if (botCheck.isErr()) {
    return err(botCheck.error);
  }

  if (!targetMembership) {
    return err(targetNotWorkspaceMemberError(targetUserId, organizationId));
  }

  if (targetMembership.role === 'owner') {
    return ok({
      demote: null,
      promote: targetMembership,
    });
  }

  return ok({
    demote: currentOwner === null ? null : { ...currentOwner, role: 'admin' },
    promote: { ...targetMembership, role: 'owner' },
  });
};
