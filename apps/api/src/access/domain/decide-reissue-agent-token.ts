import { err, ok, type Result } from 'neverthrow';
import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';
import { requireHumanActor } from './require-human-actor.js';
import type { ReissueAgentTokenCommand } from './token-commands.js';
import type { TokenCreated, TokenRevoked } from './token-events.js';
import type { BotCannotManageTokensError } from './token-errors.js';
import {
  insufficientPermissionsError,
  membershipNotFoundError,
  type InsufficientPermissionsError,
  type MembershipNotFoundError,
} from './organization-errors.js';

export type ReissueAgentTokenDecision = {
  revoke: TokenRevoked[];
  create: TokenCreated;
};

export type DecideReissueAgentTokenError =
  | BotCannotManageTokensError
  | InsufficientPermissionsError
  | MembershipNotFoundError;

export type DecideReissueAgentTokenInput = {
  command: ReissueAgentTokenCommand;
  actorRole: MembershipRole | null;
  targetMembership: { userId: string; organizationId: string } | null;
  targetKind: PrincipalKind | null;
  activeTokens: readonly { id: string; userId: string; organizationId: string }[];
  tokenName: string;
  newTokenId: string;
  now: string;
};

export const decideReissueAgentToken = ({
  command,
  actorRole,
  targetMembership,
  targetKind,
  activeTokens,
  tokenName,
  newTokenId,
  now,
}: DecideReissueAgentTokenInput): Result<ReissueAgentTokenDecision, DecideReissueAgentTokenError> => {
  const human = requireHumanActor(command.actor);
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

  return ok({
    revoke: activeTokens.map((token) => ({
      type: 'TokenRevoked' as const,
      id: token.id,
      userId: token.userId,
      organizationId: token.organizationId,
      revokedAt: now,
    })),
    create: {
      type: 'TokenCreated',
      id: newTokenId,
      userId: command.memberUserId,
      organizationId: command.organizationId,
      name: tokenName,
      createdAt: now,
    },
  });
};
