import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  callerLogFields,
  callerLogInputOf,
  rememberPublicApiAlias,
} from '../../../platform/logging/request-caller.js';
import { setAliasHeaders, type AliasRetirementWindow } from './alias-headers.js';

export type PublicApiAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * Marks the route and sets alias headers before auth, so a 401 still carries them.
 * The request line itself is written on the way out, after a token check can
 * record its id. The bearer secret, raw token, and hash are not logged.
 * This does not add a token id to the actor.
 */
export const markPublicApiRequest =
  (alias: boolean, window?: AliasRetirementWindow) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    rememberPublicApiAlias(request, alias);
    if (alias) setAliasHeaders(request, reply, window);
  };

/** `public api request`, including the token id when this call authenticated with one. */
export const logPublicApiRequest = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  request.log.info(
    {
      apiVersion: 'v1',
      url: request.url,
      ...callerLogFields({
        ...callerLogInputOf(request, reply.statusCode),
        alias: request.publicApiAlias === true,
      }),
    },
    'public api request',
  );
};
