import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Request the OpenAPI adapter closes over. Auth, if any, is already on it.
 * `reply` is for adapter side effects that are not the JSON body (session cookies).
 */
export type OrpcHttpContext = {
  readonly request: FastifyRequest;
  readonly reply: FastifyReply;
};
