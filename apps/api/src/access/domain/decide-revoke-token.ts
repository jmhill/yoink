import { err, ok, type Result } from 'neverthrow';
import type { ApiToken } from './api-token.js';
import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';
import type { RevokeTokenCommand } from './token-commands.js';
import type { TokenRevoked } from './token-events.js';
import { canManageOrgToken } from './can-manage-token.js';
import { requireHumanActor } from './require-human-actor.js';
import {
  tokenOwnershipError,
  userTokenNotFoundError,
  type RevokeTokenError,
} from './token-errors.js';

export type DecideRevokeTokenInput = {
  command: RevokeTokenCommand;
  current: ApiToken | null;
  actorRole: MembershipRole | null;
  tokenOwnerKind: PrincipalKind;
  now: string;
};

export type DecideRevokeTokenError = Exclude<RevokeTokenError, { type: 'TOKEN_STORAGE_ERROR' }>;

export const decideRevokeToken = ({
  command,
  current,
  actorRole,
  tokenOwnerKind,
  now,
}: DecideRevokeTokenInput): Result<TokenRevoked, DecideRevokeTokenError> => {
  const actor = requireHumanActor(command.actor);
  if (actor.isErr()) {
    return err(actor.error);
  }

  if (!current || current.organizationId !== command.organizationId || current.revokedAt) {
    return err(userTokenNotFoundError(command.tokenId));
  }

  if (
    !canManageOrgToken({
      actorUserId: actor.value.userId,
      actorRole,
      tokenUserId: current.userId,
      tokenOwnerKind,
    })
  ) {
    return err(tokenOwnershipError(command.tokenId, actor.value.userId));
  }

  return ok({
    type: 'TokenRevoked',
    id: current.id,
    userId: current.userId,
    organizationId: current.organizationId,
    revokedAt: now,
  });
};
