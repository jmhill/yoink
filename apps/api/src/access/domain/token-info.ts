import type { PrincipalKind } from './user.js';

export type TokenOwnerInfo = {
  userId: string;
  kind: PrincipalKind;
};

export type TokenInfo = {
  id: string;
  name: string;
  lastUsedAt: string | undefined;
  createdAt: string;
};

export type TokenListResult = {
  tokens: TokenInfo[];
};

export const toTokenInfo = (token: {
  id: string;
  name: string;
  lastUsedAt?: string;
  createdAt: string;
}): TokenInfo => ({
  id: token.id,
  name: token.name,
  lastUsedAt: token.lastUsedAt,
  createdAt: token.createdAt,
});
