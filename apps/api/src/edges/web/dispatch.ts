import type { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';

export const WEB_API_PREFIX = '/web-api';

/**
 * The prefix is stripped by oRPC before it matches `/inbox` or a settings path.
 * Fastify accepts a JSON DELETE with an empty body when Content-Length is
 * absent and leaves `request.body` unset. oRPC then reads the raw stream,
 * which that parser already consumed. Null is not a plain object, so the
 * OpenAPI decoder keeps the path params as input.
 */
export const dispatchWebApi = async (
  handler: OpenAPIHandler<OrpcHttpContext>,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  if (request.method === 'DELETE' && request.body === undefined) {
    request.body = null;
  }
  const result = await handler.handle(request, reply, {
    prefix: WEB_API_PREFIX,
    context: { request, reply },
  });
  if (!result.matched) {
    return reply.status(404).send({ message: 'Not found' });
  }
  return reply;
};
