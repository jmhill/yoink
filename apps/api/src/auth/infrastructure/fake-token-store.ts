import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStore } from '../domain/token-store.js';
import { tokenStorageError, type TokenStorageError } from '../domain/auth-errors.js';

export type FakeTokenStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialTokens?: ApiToken[];
};

export const createFakeTokenStore = (
  options: FakeTokenStoreOptions = {}
): TokenStore => {
  const tokens: ApiToken[] = [...(options.initialTokens ?? [])];

  return {
    save: (token: ApiToken): ResultAsync<void, TokenStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(tokenStorageError('Save failed'));
      }
      tokens.push(token);
      return okAsync(undefined);
    },

    findById: (id: string): ResultAsync<ApiToken | null, TokenStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(tokenStorageError('Find failed'));
      }
      const found = tokens.find((t) => t.id === id);
      return okAsync(found ?? null);
    },

    updateLastUsed: (id: string, timestamp: string): ResultAsync<void, TokenStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(tokenStorageError('Update failed'));
      }
      const token = tokens.find((t) => t.id === id);
      if (token) {
        const index = tokens.indexOf(token);
        tokens[index] = { ...token, lastUsedAt: timestamp };
      }
      return okAsync(undefined);
    },

    hasAnyTokens: (): ResultAsync<boolean, TokenStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(tokenStorageError('Check failed'));
      }
      return okAsync(tokens.length > 0);
    },
  };
};
