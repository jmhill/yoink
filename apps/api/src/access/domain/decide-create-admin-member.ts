import { err, ok, type Result } from 'neverthrow';
import type { CreateMemberPlan } from './admin-plan.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Organization } from './organization.js';
import type {
  BotCannotHavePrivilegedRoleError,
  OrganizationStorageError,
} from './organization-errors.js';
import { agentEmailFor, type PrincipalKind, type User } from './user.js';

export type AdminCreateUserCommand = {
  readonly organizationId: string;
  readonly email: string;
  /** Defaults to member. Owner is assigned only via setOrganizationOwner. */
  readonly role?: 'admin' | 'member';
  readonly kind?: PrincipalKind;
  readonly name?: string;
};

export type DecideCreateAdminMemberInput = {
  readonly command: AdminCreateUserCommand;
  readonly organization: Organization | null;
  readonly userId: string;
};

export type CreateAdminMemberDecision = {
  readonly email: string;
  readonly role: 'admin' | 'member';
  readonly kind?: PrincipalKind;
  readonly name?: string;
};

export type DecideCreateAdminMemberError =
  | BotCannotHavePrivilegedRoleError
  | OrganizationStorageError;

const organizationMissing = (): OrganizationStorageError => ({
  type: 'ORGANIZATION_STORAGE_ERROR',
  message: 'Organization not found',
});

/**
 * Bot check runs before the missing-organization check, matching the
 * previous service order. An agent keeps a reserved email.
 */
export const decideCreateAdminMember = (
  input: DecideCreateAdminMemberInput
): Result<CreateAdminMemberDecision, DecideCreateAdminMemberError> => {
  const role = input.command.role ?? 'member';
  const botCheck = decideBotMayHaveRole(input.command.kind ?? 'human', role);
  if (botCheck.isErr()) {
    return err(botCheck.error);
  }
  if (!input.organization) {
    return err(organizationMissing());
  }
  return ok({
    email:
      input.command.kind === 'agent'
        ? agentEmailFor(input.userId)
        : input.command.email,
    role,
    ...(input.command.kind !== undefined ? { kind: input.command.kind } : {}),
    ...(input.command.name !== undefined ? { name: input.command.name } : {}),
  });
};

export const planCreateAdminMember = (input: {
  readonly decision: CreateAdminMemberDecision;
  readonly userId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly now: string;
}): CreateMemberPlan => {
  const user: User = {
    id: input.userId,
    email: input.decision.email,
    createdAt: input.now,
    ...(input.decision.name !== undefined ? { name: input.decision.name } : {}),
    ...(input.decision.kind !== undefined ? { kind: input.decision.kind } : {}),
  };
  const membership: OrganizationMembership = {
    id: input.membershipId,
    userId: input.userId,
    organizationId: input.organizationId,
    role: input.decision.role,
    isPersonalOrg: false,
    joinedAt: input.now,
  };
  return { kind: 'create-member', user, membership };
};
