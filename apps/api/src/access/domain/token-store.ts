import type { ResultAsync } from 'neverthrow';
import type { ApiToken } from './api-token.js';
import type { TokenStorageError } from './auth-errors.js';
import type { DuplicateTokenNameError } from './token-errors.js';

export type TokenWriteError = TokenStorageError | DuplicateTokenNameError;

export type TokenStore = {
  save(token: ApiToken): ResultAsync<void, TokenWriteError>;
  findById(id: string): ResultAsync<ApiToken | null, TokenStorageError>;
  findByUserId(userId: string): ResultAsync<ApiToken[], TokenStorageError>;
  findByOrganizationId(organizationId: string): ResultAsync<ApiToken[], TokenStorageError>;
  findByUserAndOrganization(
    userId: string,
    organizationId: string
  ): ResultAsync<ApiToken[], TokenStorageError>;
  updateLastUsed(id: string, timestamp: string): ResultAsync<void, TokenStorageError>;
  updateName(id: string, name: string | null): ResultAsync<void, TokenWriteError>;
  revoke(id: string, revokedAt: string): ResultAsync<void, TokenStorageError>;
  hasAnyTokens(): ResultAsync<boolean, TokenStorageError>;
};
