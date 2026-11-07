import type { FastifyReply, FastifyRequest } from 'fastify';
import { setAliasHeaders } from './alias-headers.js';

export type PublicApiAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

const tokenIdOf = (request: FastifyRequest): string | undefined => {
  const actor = request.authContext?.actor;
  return actor?.kind === 'bot' ? actor.tokenId : undefined;
};

/**
 * Each request logs `apiVersion` and `alias` before auth, so a 401 still has them.
 * A bot token id is logged after auth. Human tokens do not carry a token id on
 * the actor, and the bearer secret is not logged.
 */
export const publicApiRequestLog = (alias: boolean) => async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  request.log.info({ apiVersion: 'v1', alias }, 'public api request');
  if (alias) setAliasHeaders(request, reply);
};

export const bindTokenId = async (request: FastifyRequest): Promise<void> => {
  const tokenId = tokenIdOf(request);
  if (tokenId !== undefined) {
    request.log.info({ tokenId, apiVersion: 'v1' }, 'public api token');
  }
};
