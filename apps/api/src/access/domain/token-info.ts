import type { PrincipalKind } from './user.js';
import type { TokenName } from './token-name.js';

export type TokenOwnerInfo = {
  userId: string;
  name: string | null;
  kind: PrincipalKind;
};

export type TokenProjection = {
  id: string;
  name: TokenName | null;
  lastUsedAt: string | undefined;
  createdAt: string;
};

export type TokenInfo = TokenProjection & {
  owner: TokenOwnerInfo;
};

export type TokenListResult = {
  tokens: TokenInfo[];
  maxTokensPerUser: number;
  ownedCount: number;
};

export const toTokenProjection = (token: {
  id: string;
  name: TokenName | null;
  lastUsedAt?: string;
  createdAt: string;
}): TokenProjection => ({
  id: token.id,
  name: token.name,
  lastUsedAt: token.lastUsedAt,
  createdAt: token.createdAt,
});

export const toTokenInfo = (
  token: {
    id: string;
    name: string | null;
    lastUsedAt?: string;
    createdAt: string;
  },
  owner: TokenOwnerInfo
): TokenInfo => ({
  ...toTokenProjection({
    ...token,
    name: token.name as TokenName | null,
  }),
  owner,
});
