import type { FastifyRequest } from 'fastify';

/** Request the OpenAPI adapter closes over. Auth, if any, is already on it. */
export type OrpcHttpContext = {
  readonly request: FastifyRequest;
};
