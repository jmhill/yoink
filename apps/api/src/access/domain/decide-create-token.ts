import { err, ok, type Result } from 'neverthrow';
import type { CreateNamedTokenCommand } from './token-commands.js';
import type { TokenCreated } from './token-events.js';
import { requireHumanActor } from './require-human-actor.js';
import { parseTokenName, tokenNameIsTaken } from './token-name.js';
import {
  duplicateTokenNameError,
  tokenLimitReachedError,
  type CreateNamedTokenError,
} from './token-errors.js';

export type DecideCreateTokenInput = {
  command: CreateNamedTokenCommand;
  existingNames: readonly string[];
  tokenCountForUser: number;
  maxTokensPerUserPerOrg: number;
  id: string;
  now: string;
};

export type DecideCreateTokenError = Exclude<CreateNamedTokenError, { type: 'TOKEN_STORAGE_ERROR' }>;

export const decideCreateToken = ({
  command,
  existingNames,
  tokenCountForUser,
  maxTokensPerUserPerOrg,
  id,
  now,
}: DecideCreateTokenInput): Result<TokenCreated, DecideCreateTokenError> => {
  const actor = requireHumanActor(command.actor);
  if (actor.isErr()) {
    return err(actor.error);
  }

  const parsed = parseTokenName(command.name);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const name = parsed.value;
  if (tokenNameIsTaken(name, existingNames)) {
    return err(duplicateTokenNameError(name));
  }

  if (tokenCountForUser >= maxTokensPerUserPerOrg) {
    return err(
      tokenLimitReachedError(command.userId, command.organizationId, maxTokensPerUserPerOrg)
    );
  }

  return ok({
    type: 'TokenCreated',
    id,
    userId: command.userId,
    organizationId: command.organizationId,
    name,
    createdAt: now,
  });
};
