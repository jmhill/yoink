import { OpenAPIHandler } from '@orpc/openapi/fastify';
import type { FastifyInstance } from 'fastify';
import { yoinkOpenApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import { createExtensionCaptureHandlers, type ExtensionCaptures } from './captures.js';
import { EXTENSION_API_PREFIX, dispatchExtensionApi } from './dispatch.js';
import {
  bindExtensionTokenId,
  extensionRequestLog,
  type ExtensionApiAuth,
} from './log-context.js';

export type ExtensionApiDependencies = {
  captures: ExtensionCaptures;
  tokenAuth: ExtensionApiAuth;
};

/**
 * Token-only capture create and list at `/extension-api/v1`.
 * Older installed builds stay on the `/api` alias. No sunset headers.
 */
export const registerExtensionApiV1 = async (
  app: FastifyInstance,
  deps: ExtensionApiDependencies
): Promise<void> => {
  const handler = new OpenAPIHandler(createExtensionCaptureHandlers(deps), yoinkOpenApiHandlerOptions);
  app.route({
    method: ['GET', 'POST'],
    url: `${EXTENSION_API_PREFIX}/captures`,
    onRequest: extensionRequestLog,
    preHandler: [deps.tokenAuth, bindExtensionTokenId],
    handler: async (request, reply) => dispatchExtensionApi(handler, request, reply),
  });
};
