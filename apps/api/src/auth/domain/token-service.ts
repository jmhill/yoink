import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Clock, PasswordHasher } from '@yoink/infrastructure';
import type { Organization } from './organization.js';
import type { User } from './user.js';
import type { ApiToken } from './api-token.js';
import type { OrganizationStore } from './organization-store.js';
import type { UserStore } from './user-store.js';
import type { TokenStore } from './token-store.js';
import type { ValidateTokenQuery } from './token-queries.js';
import {
  invalidTokenFormatError,
  tokenNotFoundError,
  invalidSecretError,
  userNotFoundError,
  organizationNotFoundError,
  type TokenValidationError,
} from './auth-errors.js';

export type AuthResult = {
  organization: Organization;
  user: User;
  token: ApiToken;
};

export type TokenService = {
  validateToken(query: ValidateTokenQuery): ResultAsync<AuthResult, TokenValidationError>;
};

export type TokenServiceDependencies = {
  organizationStore: OrganizationStore;
  userStore: UserStore;
  tokenStore: TokenStore;
  passwordHasher: PasswordHasher;
  clock: Clock;
};

type ParsedToken = {
  tokenId: string;
  secret: string;
};

const parseToken = (token: string): ParsedToken | null => {
  const colonIndex = token.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }

  const tokenId = token.slice(0, colonIndex);
  const secret = token.slice(colonIndex + 1);

  if (tokenId.length === 0 || secret.length === 0) {
    return null;
  }

  return { tokenId, secret };
};

export const createTokenService = (
  deps: TokenServiceDependencies
): TokenService => {
  const { organizationStore, userStore, tokenStore, passwordHasher, clock } = deps;

  return {
    validateToken: (query: ValidateTokenQuery): ResultAsync<AuthResult, TokenValidationError> => {
      // Parse tokenId:secret format
      const parsed = parseToken(query.plaintext);
      if (!parsed) {
        return errAsync(invalidTokenFormatError());
      }

      // Lookup token by ID (O(1))
      return tokenStore.findById(parsed.tokenId).andThen((token) => {
        if (!token) {
          return errAsync(tokenNotFoundError(parsed.tokenId));
        }

        // Verify secret against stored hash
        // Wrap the Promise-based compare in a ResultAsync
        return ResultAsync.fromPromise(
          passwordHasher.compare(parsed.secret, token.tokenHash),
          () => tokenNotFoundError(parsed.tokenId) // This shouldn't happen in practice
        ).andThen((isMatch) => {
          if (!isMatch) {
            return errAsync(invalidSecretError(parsed.tokenId));
          }

          return userStore.findById(token.userId).andThen((user) => {
            if (!user) {
              return errAsync(userNotFoundError(token.userId));
            }

            return organizationStore.findById(user.organizationId).andThen((organization) => {
              if (!organization) {
                return errAsync(organizationNotFoundError(user.organizationId));
              }

              // Update lastUsedAt (fire and forget - we don't want to fail validation if this fails)
              tokenStore.updateLastUsed(token.id, clock.now().toISOString());

              return okAsync({ organization, user, token });
            });
          });
        });
      });
    },
  };
};
