import { errAsync, type ResultAsync } from 'neverthrow';
import type { RevokeTokenCommand } from '../domain/token-commands.js';
import type { TokenRevoked } from '../domain/token-events.js';
import { decideRevokeToken } from '../domain/decide-revoke-token.js';
import type { RevokeTokenError } from '../domain/token-errors.js';
import type { LoadToken, PersistTokenEvent } from './token-ports.js';

export type HandleRevokeTokenDeps = {
  load: LoadToken;
  persist: PersistTokenEvent;
  now: () => string;
};

export const handleRevokeToken = (
  command: RevokeTokenCommand,
  deps: HandleRevokeTokenDeps
): ResultAsync<TokenRevoked, RevokeTokenError> => {
  return deps.load(command.tokenId).andThen((current) => {
    const decision = decideRevokeToken({
      command,
      current,
      now: deps.now(),
    });
    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    const event = decision.value;
    return deps.persist({ event }).map(() => event);
  });
};
