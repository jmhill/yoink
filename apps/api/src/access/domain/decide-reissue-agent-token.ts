import { err, ok, type Result } from 'neverthrow';
import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';
import { requireWebSessionPerson } from './require-web-session-person.js';
import type { ReissueAgentTokenCommand } from './token-commands.js';
import type { TokenCreated } from './token-events.js';
import {
  invalidTokenNameError,
  type BotCannotManageTokensError,
  type InvalidTokenNameError,
} from './token-errors.js';
import {
  insufficientPermissionsError,
  membershipNotFoundError,
  type InsufficientPermissionsError,
  type MembershipNotFoundError,
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
  | InsufficientPermissionsError
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

  if (actorRole !== 'owner') {
    return err(insufficientPermissionsError('owner', actorRole ?? 'none'));
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
