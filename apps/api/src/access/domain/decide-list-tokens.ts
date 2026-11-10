import type { ApiToken } from './api-token.js';
import { toTokenInfo, type TokenListResult } from './token-info.js';

/**
 * Metadata for the tokens the caller already loaded for one user in one
 * organization. Revoked rows drop out. The hash and the secret are not copied.
 */
export const decideTokenList = (tokens: readonly ApiToken[]): TokenListResult => ({
  tokens: tokens
    .filter((token) => token.revokedAt === undefined)
    .map((token) => toTokenInfo(token)),
});
