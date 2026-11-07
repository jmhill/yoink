import type { FastifyReply, FastifyRequest } from 'fastify';

/** ADR §9 public-API minimum. M7.1 is the announcement, not this constant. */
export const PUBLIC_API_ALIAS_MIN_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * A real retirement window. Production omits this until M7.1 records the date.
 * Passing one sets `Deprecation` and `Sunset`. It does not invent a date.
 */
export type AliasRetirementWindow = {
  deprecation: Date;
  sunset: Date;
};

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

export const aliasRetirementHttpDates = (
  window: AliasRetirementWindow,
): { deprecation: string; sunset: string } => {
  const span = window.sunset.getTime() - window.deprecation.getTime();
  if (!Number.isFinite(span) || span < PUBLIC_API_ALIAS_MIN_WINDOW_MS) {
    throw new Error(
      `public API alias retirement is ${span}ms, shorter than the 90-day minimum`,
    );
  }
  return {
    deprecation: window.deprecation.toUTCString(),
    sunset: window.sunset.toUTCString(),
  };
};

/**
 * Alias responses always name the v1 successor. `Deprecation` and `Sunset`
 * are set only when a window of at least 90 days was passed in. The unset
 * production path does not advertise a retirement date.
 */
export const setAliasHeaders = (
  request: FastifyRequest,
  reply: FastifyReply,
  window?: AliasRetirementWindow,
): void => {
  if (window !== undefined) {
    const dates = aliasRetirementHttpDates(window);
    reply.header('Deprecation', dates.deprecation);
    reply.header('Sunset', dates.sunset);
  }
  reply.header('Link', `<${v1SuccessorPath(request.url)}>; rel="successor-version"`);
};
