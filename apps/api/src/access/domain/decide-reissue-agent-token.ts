import { err, ok, type Result } from 'neverthrow';
import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';
import { requireWebSessionPerson } from './require-web-session-person.js';
import { isAdminRole } from './membership-roles.js';
import type { ReissueAgentTokenCommand } from './token-commands.js';
import type { TokenCreated } from './token-events.js';
import {
  invalidTokenNameError,
  type BotCannotManageTokensError,
  type InvalidTokenNameError,
} from './token-errors.js';
import {
  membershipNotFoundError,
  reissueNotAllowedError,
  type MembershipNotFoundError,
  type ReissueNotAllowedError,
} from './organization-errors.js';

export type ReissueScope = {
  userId: string;
  organizationId: string;
  revokedAt: string;
};

export type ReissueAgentTokenDecision = {
  revoke: ReissueScope;
  create: TokenCreated;
};

export type DecideReissueAgentTokenError =
  | BotCannotManageTokensError
  | InvalidTokenNameError
  | ReissueNotAllowedError
  | MembershipNotFoundError;

export type DecideReissueAgentTokenInput = {
  command: ReissueAgentTokenCommand;
  actorRole: MembershipRole | null;
  targetMembership: { userId: string; organizationId: string } | null;
  targetKind: PrincipalKind | null;
  tokenName: string | null;
  newTokenId: string;
  now: string;
};

export const decideReissueAgentToken = ({
  command,
  actorRole,
  targetMembership,
  targetKind,
  tokenName,
  newTokenId,
  now,
}: DecideReissueAgentTokenInput): Result<ReissueAgentTokenDecision, DecideReissueAgentTokenError> => {
  const human = requireWebSessionPerson(command.actor);
  if (human.isErr()) {
    return err(human.error);
  }

  if (actorRole === null || !isAdminRole(actorRole)) {
    return err(reissueNotAllowedError());
  }

  if (
    !targetMembership ||
    targetMembership.userId !== command.memberUserId ||
    targetMembership.organizationId !== command.organizationId ||
    targetKind !== 'agent'
  ) {
    return err(
      membershipNotFoundError({
        userId: command.memberUserId,
        organizationId: command.organizationId,
      })
    );
  }

  const name = tokenName?.trim() ?? '';
  if (name.length === 0) {
    return err(invalidTokenNameError('Agent name is required'));
  }

  return ok({
    revoke: {
      userId: command.memberUserId,
      organizationId: command.organizationId,
      revokedAt: now,
    },
    create: {
      type: 'TokenCreated',
      id: newTokenId,
      userId: command.memberUserId,
      organizationId: command.organizationId,
      name,
      createdAt: now,
    },
  });
};
