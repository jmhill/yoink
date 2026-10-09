import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStore, TokenWriteError } from '../domain/token-store.js';
import { tokenStorageError, type TokenStorageError } from '../domain/auth-errors.js';

export type FakeTokenStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialTokens?: ApiToken[];
};

const isActive = (token: ApiToken): boolean => token.revokedAt === undefined;

export const createFakeTokenStore = (
  options: FakeTokenStoreOptions = {}
): TokenStore => {
  const tokens: ApiToken[] = [...(options.initialTokens ?? [])];

  const revokeInPlace = (id: string, revokedAt: string): void => {
    const token = tokens.find((candidate) => candidate.id === id);
    if (token && !token.revokedAt) {
      const index = tokens.indexOf(token);
      tokens[index] = { ...token, revokedAt };
    }
  };

  return {
    save: (token: ApiToken): ResultAsync<void, TokenWriteError> => {
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

    findByUserId: (userId: string): ResultAsync<ApiToken[], TokenStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(tokenStorageError('Find failed'));
      }
      const found = tokens.filter((t) => t.userId === userId && isActive(t));
      return okAsync(found);
    },

    findByOrganizationId: (organizationId: string): ResultAsync<ApiToken[], TokenStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(tokenStorageError('Find failed'));
      }
      const found = tokens.filter((t) => t.organizationId === organizationId && isActive(t));
      return okAsync(found);
    },

    findByUserAndOrganization: (userId: string, organizationId: string): ResultAsync<ApiToken[], TokenStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(tokenStorageError('Find failed'));
      }
      const found = tokens.filter(
        (t) => t.userId === userId && t.organizationId === organizationId && isActive(t)
      );
      return okAsync(found);
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

    revoke: (id: string, revokedAt: string): ResultAsync<void, TokenStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(tokenStorageError('Delete failed'));
      }
      revokeInPlace(id, revokedAt);
      return okAsync(undefined);
    },

    reissue: ({ userId, organizationId, revokedAt, token }): ResultAsync<void, TokenWriteError> => {
      if (options.shouldFailOnSave) {
        return errAsync(tokenStorageError('Reissue failed'));
      }
      for (const candidate of tokens) {
        if (
          candidate.userId === userId &&
          candidate.organizationId === organizationId &&
          !candidate.revokedAt
        ) {
          revokeInPlace(candidate.id, revokedAt);
        }
      }
      tokens.push(token);
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
