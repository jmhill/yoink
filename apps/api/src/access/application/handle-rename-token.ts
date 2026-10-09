import { errAsync, type ResultAsync } from 'neverthrow';
import type { RenameTokenCommand } from '../domain/token-commands.js';
import type { TokenRenamed } from '../domain/token-events.js';
import { toTokenInfo, type TokenInfo } from '../domain/token-info.js';
import { applyTokenEvent } from '../domain/apply-token-event.js';
import { decideRenameToken } from '../domain/decide-rename-token.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { RenameTokenError } from '../domain/token-errors.js';
import type { ListOrgTokens, LoadToken, PersistTokenEvent } from './token-ports.js';

export type HandleRenameTokenDeps = {
  load: LoadToken;
  listOrgTokens: ListOrgTokens;
  persist: PersistTokenEvent;
};

export type RenameTokenResult = {
  event: TokenRenamed;
  token: TokenInfo;
};

export const handleRenameToken = (
  command: RenameTokenCommand,
  deps: HandleRenameTokenDeps
): ResultAsync<RenameTokenResult, RenameTokenError> => {
  return deps.load(command.tokenId).andThen((current) => {
    const persistDecision = (existingNames: readonly string[]) => {
      const decision = decideRenameToken({
        command,
        current,
        existingNames,
      });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      const event = decision.value;
      const token = applyTokenEvent(current ? toTokenInfo(current) : null, event);
      if (!token) {
        return errAsync(tokenStorageError('Rename did not project a token'));
      }

      return deps.persist({ event }).map(() => ({ event, token }));
    };

    if (!current || current.organizationId !== command.organizationId) {
      return persistDecision([]);
    }

    return deps.listOrgTokens(command.organizationId).andThen((orgTokens) =>
      persistDecision(
        orgTokens
          .map((token) => token.name)
          .filter((name): name is string => name !== null)
      )
    );
  });
};
