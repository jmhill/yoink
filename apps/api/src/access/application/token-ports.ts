import type { ResultAsync } from 'neverthrow';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStorageError } from '../domain/auth-errors.js';
import type { TokenEvent } from '../domain/token-events.js';

export type ListOrgTokens = (
  organizationId: string
) => ResultAsync<ApiToken[], TokenStorageError>;

export type ListUserOrgTokens = (
  userId: string,
  organizationId: string
) => ResultAsync<ApiToken[], TokenStorageError>;

export type LoadToken = (id: string) => ResultAsync<ApiToken | null, TokenStorageError>;

export type PersistTokenEvent = (input: {
  event: TokenEvent;
  tokenHash?: string;
}) => ResultAsync<void, TokenStorageError>;

export type HashSecret = (secret: string) => ResultAsync<string, TokenStorageError>;
