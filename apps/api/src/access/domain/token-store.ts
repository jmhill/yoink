import type { ResultAsync } from 'neverthrow';
import type { ApiToken } from './api-token.js';
import type { TokenStorageError } from './auth-errors.js';

export type TokenWriteError = TokenStorageError;

export type TokenReissueWrite = {
  revokeIds: readonly string[];
  revokedAt: string;
  token: ApiToken;
};

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
  revoke(id: string, revokedAt: string): ResultAsync<void, TokenStorageError>;
  reissue(write: TokenReissueWrite): ResultAsync<void, TokenWriteError>;
  hasAnyTokens(): ResultAsync<boolean, TokenStorageError>;
};
