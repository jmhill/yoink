/**
 * Which unmatched URL may receive an SPA `index.html`.
 *
 * `/admin` and `/admin/...` are the admin app. `/admin-api` is a separate
 * prefix and is not that app. `/api`, `/test-api`, `/web-api`, and
 * `/extension-api` are the same kind of prefix. An unmatched URL under one
 * of them is a JSON 404. M3.4 mounts `/test-api`. It does not mount
 * `/web-api`, `/admin-api`, or `/extension-api`.
 */

const RESERVED_API_PREFIXES = [
  '/api',
  '/test-api',
  '/admin-api',
  '/web-api',
  '/extension-api',
] as const;

export type SpaFallbackDecision = 'admin-spa' | 'web-spa' | 'json-not-found';

const pathnameOf = (url: string): string => {
  const query = url.indexOf('?');
  return query < 0 ? url : url.slice(0, query);
};

const matchesPrefix = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export const decideSpaFallback = (url: string): SpaFallbackDecision => {
  const pathname = pathnameOf(url);
  if (RESERVED_API_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return 'json-not-found';
  }
  if (matchesPrefix(pathname, '/admin')) {
    return 'admin-spa';
  }
  return 'web-spa';
};
