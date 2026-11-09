import type { FastifyReply, FastifyRequest } from 'fastify';

export type ExtensionApiAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export const EXTENSION_VERSION_HEADER = 'x-yoink-extension-version';

const tokenIdOf = (request: FastifyRequest): string | undefined => {
  const actor = request.authContext?.actor;
  return actor?.kind === 'bot' ? actor.tokenId : undefined;
};

const extensionVersionOf = (request: FastifyRequest): string => {
  const header = request.headers[EXTENSION_VERSION_HEADER];
  return typeof header === 'string' && header.length > 0 ? header : 'absent';
};

/**
 * Logs the extension version before auth, so a 401 still has it.
 * A bot token id is logged after auth. A human token's actor has no token id.
 * The bearer secret is not logged.
 */
export const extensionRequestLog = async (request: FastifyRequest): Promise<void> => {
  request.log.info(
    {
      apiVersion: 'v1',
      edge: 'extension',
      extensionVersion: extensionVersionOf(request),
    },
    'extension api request'
  );
};

export const bindExtensionTokenId = async (request: FastifyRequest): Promise<void> => {
  const tokenId = tokenIdOf(request);
  if (tokenId !== undefined) {
    request.log.info({ tokenId, apiVersion: 'v1', edge: 'extension' }, 'extension api token');
  }
};
