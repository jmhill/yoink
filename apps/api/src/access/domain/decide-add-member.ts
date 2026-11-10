import { err, ok, type Result } from 'neverthrow';
import type { AddMemberCommand } from './membership-commands.js';
import type { AddMemberPlan } from './membership-plan.js';
import type { OrganizationMembership } from './organization-membership.js';
import { principalKindOf, type User } from './user.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import { ownerOf } from './owner-presence.js';
import {
  alreadyMemberError,
  organizationNotFoundError,
  secondOwnerError,
  type AlreadyMemberError,
  type BotCannotHavePrivilegedRoleError,
  type OrganizationNotFoundError,
  type SecondOwnerError,
} from './organization-errors.js';
import { userNotFoundError, type UserNotFoundError } from './user-errors.js';

/** The user query only needs to show that the person or agent is there. */
export type AddMemberUser = User | null;

/** The organization query only needs to show that the workspace is there. */
export type AddMemberOrganization = {
  readonly id: string;
} | null;

/**
 * What may be written. The membership id and joinedAt are applied by
 * `planAddMember` after this decision.
 */
export type AddMemberDecision = {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: OrganizationMembership['role'];
  readonly isPersonalOrg: boolean;
};

export type DecideAddMemberInput = {
  command: AddMemberCommand;
  user: User;
  existing: OrganizationMembership | null;
  members: readonly OrganizationMembership[];
};

export type DecideAddMemberError =
  | AlreadyMemberError
  | BotCannotHavePrivilegedRoleError
  | SecondOwnerError;

/**
 * The user query goes in first. A missing user is refused before the
 * workspace is loaded, matching the previous service order.
 */
export const decideAddMemberUser = (input: {
  readonly command: AddMemberCommand;
  readonly user: AddMemberUser;
}): Result<User, UserNotFoundError> => {
  if (!input.user) {
    return err(userNotFoundError(input.command.userId));
  }
  return ok(input.user);
};

/**
 * The workspace query goes in after the user. A missing workspace is
 * refused before memberships are loaded.
 */
export const decideAddMemberOrganization = (input: {
  readonly command: AddMemberCommand;
  readonly organization: AddMemberOrganization;
}): Result<void, OrganizationNotFoundError> => {
  if (!input.organization) {
    return err(organizationNotFoundError(input.command.organizationId));
  }
  return ok(undefined);
};

/**
 * Bot role, already a member, then a second owner. The user and the
 * workspace are already present.
 */
export const decideAddMember = ({
  command,
  user,
  existing,
  members,
}: DecideAddMemberInput): Result<AddMemberDecision, DecideAddMemberError> => {
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
    userId: command.userId,
    organizationId: command.organizationId,
    role: command.role,
    isPersonalOrg: command.isPersonalOrg ?? false,
  });
};

export const planAddMember = (input: {
  readonly decision: AddMemberDecision;
  readonly membershipId: string;
  readonly now: string;
}): AddMemberPlan => ({
  kind: 'add-member',
  membership: {
    id: input.membershipId,
    userId: input.decision.userId,
    organizationId: input.decision.organizationId,
    role: input.decision.role,
    isPersonalOrg: input.decision.isPersonalOrg,
    joinedAt: input.now,
  },
});
