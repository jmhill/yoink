import { err, ok, type Result } from 'neverthrow';
import type { ApiToken } from './api-token.js';
import type { RevokeTokenCommand } from './token-commands.js';
import type { TokenRevoked } from './token-events.js';
import { requireWebSessionPerson } from './require-web-session-person.js';
import {
  tokenOwnershipError,
  userTokenNotFoundError,
  type RevokeTokenError,
} from './token-errors.js';

export type DecideRevokeTokenInput = {
  command: RevokeTokenCommand;
  current: ApiToken | null;
  now: string;
};

export type DecideRevokeTokenError = Exclude<RevokeTokenError, { type: 'TOKEN_STORAGE_ERROR' }>;

export const decideRevokeToken = ({
  command,
  current,
  now,
}: DecideRevokeTokenInput): Result<TokenRevoked, DecideRevokeTokenError> => {
  const actor = requireWebSessionPerson(command.actor);
  if (actor.isErr()) {
    return err(actor.error);
  }

  if (!current || current.organizationId !== command.organizationId || current.revokedAt) {
    return err(userTokenNotFoundError(command.tokenId));
  }

  if (current.userId !== actor.value.userId) {
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
