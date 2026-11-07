import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Far-future placeholder. M7.1 replaces it with the announced sunset.
 * This date does not start the 90-day public-API retirement window.
 */
export const PUBLIC_API_ALIAS_PLACEHOLDER_HTTP_DATE = 'Fri, 01 Jan 2100 00:00:00 GMT';

/** `/api/captures/1?x=1` becomes `/api/v1/captures/1?x=1`. */
export const v1SuccessorPath = (url: string): string => {
  const queryAt = url.indexOf('?');
  const path = queryAt === -1 ? url : url.slice(0, queryAt);
  const query = queryAt === -1 ? '' : url.slice(queryAt);
  if (path !== '/api' && !path.startsWith('/api/')) {
    throw new Error(`public API alias path is not under /api: ${path}`);
  }
  return `/api/v1${path.slice('/api'.length)}${query}`;
};

export const setAliasHeaders = (request: FastifyRequest, reply: FastifyReply): void => {
  reply.header('Deprecation', PUBLIC_API_ALIAS_PLACEHOLDER_HTTP_DATE);
  reply.header('Sunset', PUBLIC_API_ALIAS_PLACEHOLDER_HTTP_DATE);
  reply.header('Link', `<${v1SuccessorPath(request.url)}>; rel="successor-version"`);
};
