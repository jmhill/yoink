import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { OrpcHttpContext } from './http-context.js';

export const dispatchOrpc = async (
  handler: OpenAPIHandler<OrpcHttpContext>,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Fastify accepts a JSON DELETE with an empty body when Content-Length is
  // absent and leaves `request.body` unset. oRPC then reads the raw stream,
  // which that parser already consumed, and the route 500s. Null is not a
  // plain object, so the OpenAPI decoder keeps the path params as input.
  if (request.method === 'DELETE' && request.body === undefined) {
    request.body = null;
  }
  const result = await handler.handle(request, reply, {
    context: { request },
  });
  if (!result.matched) {
    return reply.status(404).send({ message: 'Not found' });
  }
  return reply;
};
