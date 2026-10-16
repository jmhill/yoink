import { err, ok, type Result } from 'neverthrow';
import type { AddMemberCommand } from './membership-commands.js';
import type { OrganizationMembership } from './organization-membership.js';
import { principalKindOf, type User } from './user.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import { ownerOf } from './owner-presence.js';
import {
  alreadyMemberError,
  secondOwnerError,
  type AlreadyMemberError,
  type BotCannotHavePrivilegedRoleError,
  type SecondOwnerError,
} from './organization-errors.js';
import { userNotFoundError, type UserNotFoundError } from './user-errors.js';

export type DecideAddMemberInput = {
  command: AddMemberCommand;
  user: User | null;
  existing: OrganizationMembership | null;
  members: readonly OrganizationMembership[];
  membershipId: string;
  now: string;
};

export type DecideAddMemberError =
  | UserNotFoundError
  | AlreadyMemberError
  | BotCannotHavePrivilegedRoleError
  | SecondOwnerError;

export const decideAddMember = ({
  command,
  user,
  existing,
  members,
  membershipId,
  now,
}: DecideAddMemberInput): Result<OrganizationMembership, DecideAddMemberError> => {
  if (!user) {
    return err(userNotFoundError(command.userId));
  }

  const botCheck = decideBotMayHaveRole(principalKindOf(user), command.role);
  if (botCheck.isErr()) {
    return err(botCheck.error);
  }

  if (existing) {
    return err(alreadyMemberError(command.userId, command.organizationId));
  }

  if (command.role === 'owner' && ownerOf(members)) {
    return err(secondOwnerError(command.organizationId));
  }

  return ok({
    id: membershipId,
    userId: command.userId,
    organizationId: command.organizationId,
    role: command.role,
    isPersonalOrg: command.isPersonalOrg ?? false,
    joinedAt: now,
  });
};
