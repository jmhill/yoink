import type { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';

export const EXTENSION_API_PREFIX = '/extension-api/v1';

/**
 * Same empty-DELETE guard as the public API dispatch. The prefix is stripped
 * by oRPC before it matches `/captures`.
 */
export const dispatchExtensionApi = async (
  handler: OpenAPIHandler<OrpcHttpContext>,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  if (request.method === 'DELETE' && request.body === undefined) {
    request.body = null;
  }
  const result = await handler.handle(request, reply, {
    prefix: EXTENSION_API_PREFIX,
    context: { request, reply },
  });
  if (!result.matched) {
    return reply.status(404).send({ message: 'Not found' });
  }
  return reply;
};
