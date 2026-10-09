import { ResultAsync, errAsync } from 'neverthrow';
import type { Clock, IdGenerator, PasswordHasher } from '@yoink/infrastructure';
import type { TokenStore } from './token-store.js';
import type { ApiToken } from './api-token.js';
import {
  tokenStorageError,
  userTokenNotFoundError,
  tokenOwnershipError,
  type UserTokenServiceError,
} from './auth-errors.js';
import { decideCreateToken } from './decide-create-token.js';
import { toTokenInfo, type TokenInfo } from './token-info.js';

export type { TokenInfo } from './token-info.js';

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

export type CreateTokenResult = {
  token: TokenInfo;
  rawToken: string;
};

export type UserTokenService = {
  listTokens(userId: string, organizationId: string): ResultAsync<TokenInfo[], UserTokenServiceError>;
  createToken(command: CreateTokenCommand): ResultAsync<CreateTokenResult, UserTokenServiceError>;
  revokeToken(userId: string, tokenId: string): ResultAsync<void, UserTokenServiceError>;
};

export const createUserTokenService = (
  deps: UserTokenServiceDependencies
): UserTokenService => {
  const { tokenStore, clock, idGenerator, passwordHasher, maxTokensPerUserPerOrg } = deps;

  return {
    listTokens(userId: string, organizationId: string) {
      return tokenStore
        .findByUserAndOrganization(userId, organizationId)
        .map((tokens) => tokens.map(toTokenInfo));
    },

    createToken(command: CreateTokenCommand) {
      const { userId, organizationId, name } = command;

      return tokenStore.findByOrganizationId(organizationId).andThen((orgTokens) => {
        const named = orgTokens
          .map((token) => token.name)
          .filter((tokenName): tokenName is string => tokenName !== null);
        const tokenCountForUser = orgTokens.filter((token) => token.userId === userId).length;
        const tokenId = idGenerator.generate();
        const secret = idGenerator.generate();
        const decision = decideCreateToken({
          command: {
            actor: { kind: 'user', userId },
            userId,
            organizationId,
            name,
          },
          existingNames: named,
          tokenCountForUser,
          maxTokensPerUserPerOrg,
          id: tokenId,
          now: clock.now().toISOString(),
        });

        if (decision.isErr()) {
          return errAsync(decision.error);
        }

        return ResultAsync.fromPromise(
          passwordHasher.hash(secret),
          (error) => tokenStorageError('Failed to hash token secret', error)
        ).andThen((tokenHash) => {
          const token: ApiToken = {
            id: tokenId,
            userId,
            organizationId,
            tokenHash,
            name: decision.value.name,
            createdAt: decision.value.createdAt,
          };

          return tokenStore.save(token).map(() => ({
            token: toTokenInfo(token),
            rawToken: `${tokenId}:${secret}`,
          }));
        });
      });
    },

    revokeToken(userId: string, tokenId: string) {
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
