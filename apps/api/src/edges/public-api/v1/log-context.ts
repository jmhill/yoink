import type { FastifyReply, FastifyRequest } from 'fastify';
import { setAliasHeaders, type AliasRetirementWindow } from './alias-headers.js';

export type PublicApiAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

const tokenIdOf = (request: FastifyRequest): string | undefined => {
  const actor = request.authContext?.actor;
  return actor?.kind === 'bot' ? actor.tokenId : undefined;
};

/**
 * Each request logs `apiVersion` and `alias` before auth, so a 401 still has them.
 * A bot token id is logged after auth. A human token's actor has no token id,
 * so M7.1's per-token evidence is bot ids only until that actor field exists.
 * The bearer secret is not logged. This does not add a token id to the actor.
 */
export const publicApiRequestLog =
  (alias: boolean, window?: AliasRetirementWindow) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    request.log.info({ apiVersion: 'v1', alias }, 'public api request');
    if (alias) setAliasHeaders(request, reply, window);
  };

export const bindTokenId = async (request: FastifyRequest): Promise<void> => {
  const tokenId = tokenIdOf(request);
  if (tokenId !== undefined) {
    request.log.info({ tokenId, apiVersion: 'v1' }, 'public api token');
  }
};
