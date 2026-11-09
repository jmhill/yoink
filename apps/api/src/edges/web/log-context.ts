import type { FastifyRequest } from 'fastify';

export const YOINK_BUILD_HEADER = 'x-yoink-build';

const buildIdOf = (request: FastifyRequest): string => {
  const header = request.headers[YOINK_BUILD_HEADER];
  return typeof header === 'string' && header.length > 0 ? header : 'absent';
};

/**
 * Logs the web build id before auth, so a 401 still has it.
 * The header value is the build id. It is not a secret.
 */
export const webRequestLog = async (request: FastifyRequest): Promise<void> => {
  request.log.info(
    {
      edge: 'web',
      buildId: buildIdOf(request),
    },
    'web api request'
  );
};
