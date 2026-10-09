import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStore, TokenWriteError } from '../domain/token-store.js';
import { tokenStorageError, type TokenStorageError } from '../domain/auth-errors.js';
import { duplicateTokenNameError } from '../domain/token-errors.js';
import { normalizeTokenName } from '../domain/token-name.js';

export type FakeTokenStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialTokens?: ApiToken[];
};

const isActive = (token: ApiToken): boolean => token.revokedAt === undefined;

const nameTaken = (tokens: ApiToken[], candidate: ApiToken): boolean => {
  if (candidate.name === null || !isActive(candidate)) {
    return false;
  }
  const normalized = normalizeTokenName(candidate.name);
  return tokens.some(
    (token) =>
      token.id !== candidate.id &&
      isActive(token) &&
      token.organizationId === candidate.organizationId &&
      token.name !== null &&
      normalizeTokenName(token.name) === normalized
  );
};

export const createFakeTokenStore = (
  options: FakeTokenStoreOptions = {}
): TokenStore => {
  const tokens: ApiToken[] = [...(options.initialTokens ?? [])];

  return {
    save: (token: ApiToken): ResultAsync<void, TokenWriteError> => {
      if (options.shouldFailOnSave) {
        return errAsync(tokenStorageError('Save failed'));
      }
      if (nameTaken(tokens, token)) {
        return errAsync(duplicateTokenNameError(token.name ?? ''));
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

    updateName: (id: string, name: string | null): ResultAsync<void, TokenWriteError> => {
      if (options.shouldFailOnSave) {
        return errAsync(tokenStorageError('Update failed'));
      }
      const token = tokens.find((t) => t.id === id);
      if (token) {
        const next = { ...token, name };
        if (nameTaken(tokens, next)) {
          return errAsync(duplicateTokenNameError(name ?? ''));
        }
        const index = tokens.indexOf(token);
        tokens[index] = next;
      }
      return okAsync(undefined);
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
      const token = tokens.find((t) => t.id === id);
      if (token && !token.revokedAt) {
        const index = tokens.indexOf(token);
        tokens[index] = { ...token, revokedAt };
      }
      return okAsync(undefined);
    },

    hasAnyTokens: (): ResultAsync<boolean, TokenStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(tokenStorageError('Check failed'));
      }
      return okAsync(tokens.some(isActive));
    },
  };
};
