import { errAsync, type ResultAsync } from 'neverthrow';
import type { CreateNamedTokenCommand } from '../domain/token-commands.js';
import type { TokenCreated } from '../domain/token-events.js';
import type { TokenInfo } from '../domain/token-info.js';
import { applyTokenEvent } from '../domain/apply-token-event.js';
import { decideCreateToken } from '../domain/decide-create-token.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { CreateNamedTokenError } from '../domain/token-errors.js';
import type { HashSecret, ListOrgTokens, PersistTokenEvent } from './token-ports.js';

export type HandleCreateTokenDeps = {
  listOrgTokens: ListOrgTokens;
  persist: PersistTokenEvent;
  hashSecret: HashSecret;
  nextId: () => string;
  nextSecret: () => string;
  now: () => string;
  maxTokensPerUserPerOrg: number;
};

export type CreateTokenResult = {
  event: TokenCreated;
  token: TokenInfo;
  rawToken: string;
};

export const handleCreateToken = (
  command: CreateNamedTokenCommand,
  deps: HandleCreateTokenDeps
): ResultAsync<CreateTokenResult, CreateNamedTokenError> => {
  return deps.listOrgTokens(command.organizationId).andThen((orgTokens) => {
    const named = orgTokens
      .map((token) => token.name)
      .filter((name): name is string => name !== null);
    const tokenCountForUser = orgTokens.filter(
      (token) => token.userId === command.userId
    ).length;

    const id = deps.nextId();
    const secret = deps.nextSecret();
    const decision = decideCreateToken({
      command,
      existingNames: named,
      tokenCountForUser,
      maxTokensPerUserPerOrg: deps.maxTokensPerUserPerOrg,
      id,
      now: deps.now(),
    });

    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    const event = decision.value;
    const token = applyTokenEvent(null, event);
    if (!token) {
      return errAsync(tokenStorageError('Create did not project a token'));
    }

    return deps.hashSecret(secret).andThen((tokenHash) =>
      deps.persist({ event, tokenHash }).map(() => ({
        event,
        token,
        rawToken: `${id}:${secret}`,
      }))
    );
  });
};
