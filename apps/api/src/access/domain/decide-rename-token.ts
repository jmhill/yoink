import { err, ok, type Result } from 'neverthrow';
import type { ApiToken } from './api-token.js';
import type { RenameTokenCommand } from './token-commands.js';
import type { TokenRenamed } from './token-events.js';
import { requireHumanActor } from './require-human-actor.js';
import { normalizeTokenName, parseTokenName, tokenNameIsTaken } from './token-name.js';
import {
  duplicateTokenNameError,
  tokenOwnershipError,
  userTokenNotFoundError,
  type RenameTokenError,
} from './token-errors.js';

export type DecideRenameTokenInput = {
  command: RenameTokenCommand;
  current: ApiToken | null;
  existingNames: readonly string[];
};

export type DecideRenameTokenError = Exclude<RenameTokenError, { type: 'TOKEN_STORAGE_ERROR' }>;

export const decideRenameToken = ({
  command,
  current,
  existingNames,
}: DecideRenameTokenInput): Result<TokenRenamed, DecideRenameTokenError> => {
  const actor = requireHumanActor(command.actor);
  if (actor.isErr()) {
    return err(actor.error);
  }

  if (!current || current.organizationId !== command.organizationId) {
    return err(userTokenNotFoundError(command.tokenId));
  }

  if (current.userId !== command.userId) {
    return err(tokenOwnershipError(command.tokenId, command.userId));
  }

  const parsed = parseTokenName(command.name);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const name = parsed.value;
  const others = current.name
    ? existingNames.filter(
        (existing) => normalizeTokenName(existing) !== normalizeTokenName(current.name ?? '')
      )
    : existingNames;

  if (tokenNameIsTaken(name, others)) {
    return err(duplicateTokenNameError(name));
  }

  return ok({
    type: 'TokenRenamed',
    id: current.id,
    userId: current.userId,
    organizationId: current.organizationId,
    name,
  });
};
