import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Clock, PasswordHasher } from '@yoink/infrastructure';
import type { Organization } from '../../organizations/domain/organization.js';
import type { OrganizationStore } from '../../organizations/domain/organization-store.js';
import { organizationNotFoundError } from '../../organizations/domain/organization-errors.js';
import type { User } from '../../users/domain/user.js';
import type { UserStore } from '../../users/domain/user-store.js';
import { userNotFoundError } from '../../users/domain/user-errors.js';
import type { ApiToken } from './api-token.js';
import type { TokenStore } from './token-store.js';
import type { ValidateTokenQuery } from './token-queries.js';
import {
  invalidTokenFormatError,
  tokenNotFoundError,
  invalidSecretError,
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

// Pre-computed dummy hash for constant-time comparison when token not found.
// This is a valid bcrypt hash that will never match any real secret.
// The actual value doesn't matter - we just need to ensure the bcrypt
// comparison runs in constant time regardless of whether the token exists.
const DUMMY_HASH = '$2b$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

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
        // Use actual hash if token exists, otherwise use dummy hash.
        // This ensures constant-time behavior to prevent timing oracle attacks
        // that could enumerate valid token IDs.
        const hashToCompare = token?.tokenHash ?? DUMMY_HASH;

        // Verify secret against stored hash (or dummy hash)
        // Wrap the Promise-based compare in a ResultAsync
        return ResultAsync.fromPromise(
          passwordHasher.compare(parsed.secret, hashToCompare),
          () => tokenNotFoundError(parsed.tokenId) // This shouldn't happen in practice
        ).andThen((isMatch) => {
          // If token doesn't exist, return not found error (after doing the comparison)
          if (!token) {
            return errAsync(tokenNotFoundError(parsed.tokenId));
          }

          if (!isMatch) {
            return errAsync(invalidSecretError(parsed.tokenId));
          }

          // Use token.organizationId to determine the org context
          // Tokens are now scoped to organizations, so we use the token's org, not the user's
          return organizationStore.findById(token.organizationId).andThen((organization) => {
            if (!organization) {
              return errAsync(organizationNotFoundError(token.organizationId));
            }

            return userStore.findById(token.userId).andThen((user) => {
              if (!user) {
                return errAsync(userNotFoundError(token.userId));
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
