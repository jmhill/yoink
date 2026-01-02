import type { ResultAsync } from 'neverthrow';
import type { ApiToken } from './api-token.js';
import type { TokenStorageError } from './auth-errors.js';

export type TokenStore = {
  save(token: ApiToken): ResultAsync<void, TokenStorageError>;
  findById(id: string): ResultAsync<ApiToken | null, TokenStorageError>;
  findByUserId(userId: string): ResultAsync<ApiToken[], TokenStorageError>;
  findByOrganizationId(organizationId: string): ResultAsync<ApiToken[], TokenStorageError>;
  updateLastUsed(id: string, timestamp: string): ResultAsync<void, TokenStorageError>;
  delete(id: string): ResultAsync<void, TokenStorageError>;
  hasAnyTokens(): ResultAsync<boolean, TokenStorageError>;
};
