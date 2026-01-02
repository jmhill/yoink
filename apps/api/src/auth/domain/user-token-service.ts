import { ResultAsync, errAsync } from 'neverthrow';
import type { Clock, IdGenerator, PasswordHasher } from '@yoink/infrastructure';
import type { TokenStore } from './token-store.js';
import type { ApiToken } from './api-token.js';
import {
  tokenStorageError,
  userTokenNotFoundError,
  tokenOwnershipError,
  tokenLimitReachedError,
  type UserTokenServiceError,
} from './auth-errors.js';

// ============================================================================
// Types
// ============================================================================

export type UserTokenServiceDependencies = {
  tokenStore: TokenStore;
  clock: Clock;
  idGenerator: IdGenerator;
  passwordHasher: PasswordHasher;
  maxTokensPerUserPerOrg: number;
};

export type CreateTokenCommand = {
  userId: string;
  organizationId: string;
  name: string;
};

/** Token info returned to users (no hash) */
export type TokenInfo = {
  id: string;
  name: string;
  lastUsedAt: string | undefined;
  createdAt: string;
};

export type CreateTokenResult = {
  token: TokenInfo;
  rawToken: string;
};

export type UserTokenService = {
  /** List all tokens for a user in a specific organization */
  listTokens(userId: string, organizationId: string): ResultAsync<TokenInfo[], UserTokenServiceError>;

  /** Create a new token. Returns error if user has reached the limit. */
  createToken(command: CreateTokenCommand): ResultAsync<CreateTokenResult, UserTokenServiceError>;

  /** Revoke a token. Only the owner can revoke their own tokens. */
  revokeToken(userId: string, tokenId: string): ResultAsync<void, UserTokenServiceError>;
};

// ============================================================================
// Implementation
// ============================================================================

const toTokenInfo = (token: ApiToken): TokenInfo => ({
  id: token.id,
  name: token.name,
  lastUsedAt: token.lastUsedAt,
  createdAt: token.createdAt,
});

export const createUserTokenService = (
  deps: UserTokenServiceDependencies
): UserTokenService => {
  const { tokenStore, clock, idGenerator, passwordHasher, maxTokensPerUserPerOrg } = deps;

  return {
    listTokens(userId: string, organizationId: string): ResultAsync<TokenInfo[], UserTokenServiceError> {
      return tokenStore
        .findByUserAndOrganization(userId, organizationId)
        .map((tokens) => tokens.map(toTokenInfo));
    },

    createToken(command: CreateTokenCommand): ResultAsync<CreateTokenResult, UserTokenServiceError> {
      const { userId, organizationId, name } = command;

      // Check current token count
      return tokenStore
        .findByUserAndOrganization(userId, organizationId)
        .andThen((existingTokens) => {
          if (existingTokens.length >= maxTokensPerUserPerOrg) {
            return errAsync(tokenLimitReachedError(userId, organizationId, maxTokensPerUserPerOrg));
          }

          const tokenId = idGenerator.generate();
          const secret = idGenerator.generate();

          // Hash the secret
          return ResultAsync.fromPromise(
            passwordHasher.hash(secret),
            (error) => tokenStorageError('Failed to hash token secret', error)
          ).andThen((tokenHash) => {
            const token: ApiToken = {
              id: tokenId,
              userId,
              organizationId,
              tokenHash,
              name,
              createdAt: clock.now().toISOString(),
            };

            return tokenStore.save(token).map(() => ({
              token: toTokenInfo(token),
              rawToken: `${tokenId}:${secret}`,
            }));
          });
        });
    },

    revokeToken(userId: string, tokenId: string): ResultAsync<void, UserTokenServiceError> {
      return tokenStore.findById(tokenId).andThen((token) => {
        if (!token) {
          return errAsync(userTokenNotFoundError(tokenId));
        }

        if (token.userId !== userId) {
          return errAsync(tokenOwnershipError(tokenId, userId));
        }

        return tokenStore.delete(tokenId);
      });
    },
  };
};
