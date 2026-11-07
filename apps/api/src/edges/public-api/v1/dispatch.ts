import type { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';

export type PublicApiPrefix = '/api/v1' | '/api';

/**
 * Same empty-DELETE guard as `edges/_shared/orpc/dispatch.ts`. The prefix is
 * the M0.3 `handle` prefix: oRPC strips it, then matches the resource path.
 */
export const dispatchPublicApi = async (
  handler: OpenAPIHandler<OrpcHttpContext>,
  request: FastifyRequest,
  reply: FastifyReply,
  prefix: PublicApiPrefix,
) => {
  if (request.method === 'DELETE' && request.body === undefined) {
    request.body = null;
  }
  const result = await handler.handle(request, reply, {
    prefix,
    context: { request, reply },
  });
  if (!result.matched) {
    return reply.status(404).send({ message: 'Not found' });
  }
  return reply;
};
