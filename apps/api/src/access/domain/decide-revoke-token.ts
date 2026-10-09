import { err, ok, type Result } from 'neverthrow';
import type { ApiToken } from './api-token.js';
import type { RevokeTokenCommand } from './token-commands.js';
import type { TokenRevoked } from './token-events.js';
import { requireHumanActor } from './require-human-actor.js';
import {
  tokenOwnershipError,
  userTokenNotFoundError,
  type RevokeTokenError,
} from './token-errors.js';

export type DecideRevokeTokenInput = {
  command: RevokeTokenCommand;
  current: ApiToken | null;
};

export type DecideRevokeTokenError = Exclude<RevokeTokenError, { type: 'TOKEN_STORAGE_ERROR' }>;

export const decideRevokeToken = ({
  command,
  current,
}: DecideRevokeTokenInput): Result<TokenRevoked, DecideRevokeTokenError> => {
  const actor = requireHumanActor(command.actor);
  if (actor.isErr()) {
    return err(actor.error);
  }

  if (!current) {
    return err(userTokenNotFoundError(command.tokenId));
  }

  if (current.userId !== command.userId) {
    return err(tokenOwnershipError(command.tokenId, command.userId));
  }

  return ok({
    type: 'TokenRevoked',
    id: current.id,
    userId: current.userId,
  });
};
