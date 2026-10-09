import type { ResultAsync } from 'neverthrow';
import type { ListTokensQuery } from '../domain/token-queries.js';
import { toTokenInfo, type TokenListResult } from '../domain/token-info.js';
import type { ListTokensError } from '../domain/token-errors.js';
import type { ListUserOrgTokens } from './token-ports.js';

export type HandleListTokensDeps = {
  listUserOrgTokens: ListUserOrgTokens;
};

export const handleListTokens = (
  query: ListTokensQuery,
  deps: HandleListTokensDeps
): ResultAsync<TokenListResult, ListTokensError> => {
  return deps.listUserOrgTokens(query.userId, query.organizationId).map((tokens) => ({
    tokens: tokens.map((token) => toTokenInfo(token)),
  }));
};
