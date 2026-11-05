import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { OrpcHttpContext } from './http-context.js';

export const dispatchOrpc = async (
  handler: OpenAPIHandler<OrpcHttpContext>,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const result = await handler.handle(request, reply, {
    context: { request },
  });
  if (!result.matched) {
    return reply.status(404).send({ message: 'Not found' });
  }
  return reply;
};
