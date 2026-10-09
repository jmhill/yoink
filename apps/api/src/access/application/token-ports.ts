import type { ResultAsync } from 'neverthrow';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStorageError } from '../domain/auth-errors.js';
import type { MembershipRole } from '../domain/organization-membership.js';
import type { TokenOwnerInfo } from '../domain/token-info.js';
import type { TokenEvent } from '../domain/token-events.js';
import type { TokenWriteError } from '../domain/token-store.js';

export type ListOrgTokens = (
  organizationId: string
) => ResultAsync<ApiToken[], TokenStorageError>;

export type LoadToken = (id: string) => ResultAsync<ApiToken | null, TokenStorageError>;

export type PersistTokenEvent = (input: {
  event: TokenEvent;
  tokenHash?: string;
}) => ResultAsync<void, TokenWriteError>;

export type HashSecret = (secret: string) => ResultAsync<string, TokenStorageError>;

export type LoadActorMembership = (
  userId: string,
  organizationId: string
) => ResultAsync<{ role: MembershipRole } | null, TokenStorageError>;

export type LoadTokenOwner = (
  userId: string
) => ResultAsync<TokenOwnerInfo | null, TokenStorageError>;
