import type { ResultAsync } from 'neverthrow';
import type { ListTokensQuery } from '../domain/token-queries.js';
import { toTokenInfo, type TokenListResult } from '../domain/token-info.js';
import type { ListTokensError } from '../domain/token-errors.js';
import type { ListOrgTokens } from './token-ports.js';

export type HandleListTokensDeps = {
  listOrgTokens: ListOrgTokens;
};

export const handleListTokens = (
  query: ListTokensQuery,
  deps: HandleListTokensDeps
): ResultAsync<TokenListResult, ListTokensError> => {
  return deps.listOrgTokens(query.organizationId).map((orgTokens) => ({
    tokens: orgTokens
      .filter((token) => token.userId === query.userId)
      .map((token) => toTokenInfo(token)),
  }));
};
