export type TokenInfo = {
  id: string;
  name: string | null;
  lastUsedAt: string | undefined;
  createdAt: string;
};

export type TokenListPage = {
  tokens: TokenInfo[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export const toTokenInfo = (token: {
  id: string;
  name: string | null;
  lastUsedAt?: string;
  createdAt: string;
}): TokenInfo => ({
  id: token.id,
  name: token.name,
  lastUsedAt: token.lastUsedAt,
  createdAt: token.createdAt,
});

export const completeTokenListPage = (tokens: TokenInfo[]): TokenListPage => ({
  tokens,
  hasMore: false,
  nextCursor: null,
  total: tokens.length,
});
