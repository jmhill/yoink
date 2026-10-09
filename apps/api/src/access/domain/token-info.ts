import type { PrincipalKind } from './user.js';

export type TokenOwnerInfo = {
  userId: string;
  name: string | null;
  kind: PrincipalKind;
};

export type TokenProjection = {
  id: string;
  name: string | null;
  lastUsedAt: string | undefined;
  createdAt: string;
};

export type TokenInfo = TokenProjection;

export type TokenListResult = {
  tokens: TokenInfo[];
};

export const toTokenProjection = (token: {
  id: string;
  name: string | null;
  lastUsedAt?: string;
  createdAt: string;
}): TokenProjection => ({
  id: token.id,
  name: token.name,
  lastUsedAt: token.lastUsedAt,
  createdAt: token.createdAt,
});

export const toTokenInfo = (token: {
  id: string;
  name: string | null;
  lastUsedAt?: string;
  createdAt: string;
}): TokenInfo => toTokenProjection(token);
