import type { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';

export const EXTENSION_API_PREFIX = '/extension-api/v1';

/**
 * The prefix is stripped by oRPC before it matches `/captures`.
 * This edge has no DELETE procedure, so it does not rewrite an empty body.
 */
export const dispatchExtensionApi = async (
  handler: OpenAPIHandler<OrpcHttpContext>,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const result = await handler.handle(request, reply, {
    prefix: EXTENSION_API_PREFIX,
    context: { request, reply },
  });
  if (!result.matched) {
    return reply.status(404).send({ message: 'Not found' });
  }
  return reply;
};
