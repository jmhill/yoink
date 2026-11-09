import type { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';

export const WEB_API_PREFIX = '/web-api';

/**
 * The prefix is stripped by oRPC before it matches `/inbox`.
 * This edge has no DELETE procedure, so it does not rewrite an empty body.
 */
export const dispatchWebApi = async (
  handler: OpenAPIHandler<OrpcHttpContext>,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const result = await handler.handle(request, reply, {
    prefix: WEB_API_PREFIX,
    context: { request, reply },
  });
  if (!result.matched) {
    return reply.status(404).send({ message: 'Not found' });
  }
  return reply;
};
