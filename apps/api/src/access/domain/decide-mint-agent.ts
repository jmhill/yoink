import { err, ok, type Result } from 'neverthrow';
import type { Actor } from '../../kernel/auth-context.js';
import type { MintAgentPlan } from './agent-plan.js';
import type { ApiToken } from './api-token.js';
import type { MembershipRole, OrganizationMembership } from './organization-membership.js';
import {
  insufficientPermissionsError,
  membershipNotFoundError,
  organizationNotFoundError,
  type InsufficientPermissionsError,
  type MembershipNotFoundError,
  type OrganizationNotFoundError,
} from './organization-errors.js';
import { requireWebSessionPerson } from './require-web-session-person.js';
import {
  invalidTokenNameError,
  type BotCannotManageTokensError,
  type InvalidTokenNameError,
} from './token-errors.js';
import { agentEmailFor, type User } from './user.js';

export type MintAgentCommand = {
  readonly actor: Actor;
  readonly organizationId: string;
  readonly name: string;
};

/** The command, after the session and name checks. No query has run. */
export type MintAgentRequest = {
  readonly actorUserId: string;
  readonly organizationId: string;
  readonly name: string;
};

/** The membership query only needs the role that gates minting. */
export type MintAgentMembership = {
  readonly role: MembershipRole;
} | null;

/** The organization query only needs to show that the workspace is there. */
export type MintAgentOrganization = {
  readonly id: string;
} | null;

export type MintAgentDecision = {
  readonly organizationId: string;
  readonly name: string;
};

export type DecideMintAgentCommandError = BotCannotManageTokensError | InvalidTokenNameError;

export type DecideMintAgentMembershipError = MembershipNotFoundError | InsufficientPermissionsError;

export type DecideMintAgentError = OrganizationNotFoundError;

/**
 * A web-session person and a trimmed name. A bot or a personal token is
 * refused before the name is checked, matching the previous service order.
 */
export const decideMintAgentCommand = (
  command: MintAgentCommand
): Result<MintAgentRequest, DecideMintAgentCommandError> => {
  const human = requireWebSessionPerson(command.actor);
  if (human.isErr()) {
    return err(human.error);
  }

  const name = command.name.trim();
  if (name.length === 0) {
    return err(invalidTokenNameError('Name is required'));
  }

  return ok({
    actorUserId: human.value.userId,
    organizationId: command.organizationId,
    name,
  });
};

/**
 * The membership query goes in. A missing membership is refused before a
 * member's role, and both are refused before the organization is loaded.
 */
export const decideMintAgentMembership = (input: {
  readonly request: MintAgentRequest;
  readonly membership: MintAgentMembership;
}): Result<void, DecideMintAgentMembershipError> => {
  if (!input.membership) {
    return err(
      membershipNotFoundError({
        userId: input.request.actorUserId,
        organizationId: input.request.organizationId,
      })
    );
  }

  if (input.membership.role === 'member') {
    return err(insufficientPermissionsError('admin', input.membership.role));
  }

  return ok(undefined);
};

/** The organization query goes in. A missing workspace writes nothing. */
export const decideMintAgent = (input: {
  readonly request: MintAgentRequest;
  readonly organization: MintAgentOrganization;
}): Result<MintAgentDecision, DecideMintAgentError> => {
  if (!input.organization) {
    return err(organizationNotFoundError(input.request.organizationId));
  }

  return ok({
    organizationId: input.request.organizationId,
    name: input.request.name,
  });
};

/**
 * The new principal is an agent member. The email is reserved from the user
 * id. The token hash is already computed.
 */
export const planMintAgent = (input: {
  readonly decision: MintAgentDecision;
  readonly userId: string;
  readonly membershipId: string;
  readonly tokenId: string;
  readonly tokenHash: string;
  readonly now: string;
}): MintAgentPlan => {
  const user: User = {
    id: input.userId,
    email: agentEmailFor(input.userId),
    name: input.decision.name,
    kind: 'agent',
    createdAt: input.now,
  };
  const membership: OrganizationMembership = {
    id: input.membershipId,
    userId: input.userId,
    organizationId: input.decision.organizationId,
    role: 'member',
    isPersonalOrg: false,
    joinedAt: input.now,
  };
  const token: ApiToken = {
    id: input.tokenId,
    userId: input.userId,
    organizationId: input.decision.organizationId,
    tokenHash: input.tokenHash,
    name: input.decision.name,
    createdAt: input.now,
  };
  return { kind: 'mint-agent', user, membership, token };
};
