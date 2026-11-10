import type { FastifyRequest } from 'fastify';

export const YOINK_BUILD_HEADER = 'x-yoink-build';

const buildIdOf = (request: FastifyRequest): string => {
  const header = request.headers[YOINK_BUILD_HEADER];
  return typeof header === 'string' && header.length > 0 ? header : 'absent';
};

/**
 * Logs the admin build id before auth, so a 401 still has it.
 * The header value is the build id. It is not the session cookie.
 */
export const adminRequestLog = async (request: FastifyRequest): Promise<void> => {
  request.log.info(
    {
      edge: 'admin',
      buildId: buildIdOf(request),
    },
    'admin api request'
  );
};
