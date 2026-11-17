import type { FastifyReply, FastifyRequest } from 'fastify';

/** ADR §9 public-API minimum. M7.1 is the announcement, not this constant. */
export const PUBLIC_API_ALIAS_MIN_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * A real retirement window. Passing one sets `Deprecation` and `Sunset`.
 * It does not invent a date.
 */
export type AliasRetirementWindow = {
  deprecation: Date;
  sunset: Date;
};

/**
 * Justin chose the Sunset on 2026-11-17 at 12:07am CT.
 * Deprecation is that instant in GMT (`Tue, 17 Nov 2026 06:07:00 GMT`).
 * Sunset is midnight GMT on the day he named (`Mon, 01 Mar 2027 00:00:00 GMT`).
 * The span is 103 days, 17 hours, and 53 minutes, which meets the 90-day minimum.
 * The alias stays mounted until M7.2.
 */
export const PUBLIC_API_ALIAS_DEPRECATION = new Date('2026-11-17T06:07:00.000Z');
export const PUBLIC_API_ALIAS_SUNSET = new Date('2027-03-01T00:00:00.000Z');

export const publicApiAliasRetirement: AliasRetirementWindow = {
  deprecation: PUBLIC_API_ALIAS_DEPRECATION,
  sunset: PUBLIC_API_ALIAS_SUNSET,
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
 * are set only when a window of at least 90 days was passed in. Canonical
 * `/api/v1` routes do not use this hook.
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
