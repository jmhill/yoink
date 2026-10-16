export type ViaFlyQuery = {
  flyAllocId?: string;
  flyAppName?: string;
};

export type ViaFlyResult = {
  viaFly: boolean;
};

export type ClientIpQuery = {
  remoteAddress: string | undefined;
  flyClientIp?: string;
  viaFly: boolean;
};

export type ClientIpResult = {
  ip: string;
};

export type RateLimitKeyQuery = {
  clientIp: string;
  userId?: string;
};

export type RateLimitKeyResult = {
  key: string;
  source: 'user' | 'ip';
};

export type RateLimitExemptQuery = {
  url: string;
};

export type RateLimitExemptResult = {
  exempt: boolean;
};

export const UNKNOWN_CLIENT_IP = '0.0.0.0';

const WORKBOX_AT_ROOT = /^\/workbox-.+\.js$/;

const nonempty = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const firstHeaderValue = (
  value: string | string[] | undefined
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return first === undefined ? undefined : nonempty(first);
  }
  return nonempty(value);
};

export const decideViaFly = (query: ViaFlyQuery): ViaFlyResult => ({
  viaFly:
    nonempty(query.flyAllocId) !== undefined || nonempty(query.flyAppName) !== undefined,
});

export const decideClientIp = (query: ClientIpQuery): ClientIpResult => {
  if (query.viaFly) {
    const flyClientIp = nonempty(query.flyClientIp);
    if (flyClientIp !== undefined) {
      return { ip: flyClientIp };
    }
  }
  const remoteAddress = nonempty(query.remoteAddress);
  if (remoteAddress !== undefined) {
    return { ip: remoteAddress };
  }
  return { ip: UNKNOWN_CLIENT_IP };
};

export const decideRateLimitKey = (query: RateLimitKeyQuery): RateLimitKeyResult => {
  const userId = nonempty(query.userId);
  if (userId !== undefined) {
    return { key: `user:${userId}`, source: 'user' };
  }
  return { key: `ip:${query.clientIp}`, source: 'ip' };
};

export const sessionIdFromCookieHeader = (
  header: string | undefined,
  name: string
): string | undefined => {
  if (header === undefined || header.length === 0) {
    return undefined;
  }
  return header.split(';').reduce<string | undefined>((found, part) => {
    if (found !== undefined) {
      return found;
    }
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      return undefined;
    }
    if (trimmed.slice(0, eq) !== name) {
      return undefined;
    }
    return nonempty(trimmed.slice(eq + 1));
  }, undefined);
};

export const bearerPlaintext = (authorization: string | undefined): string | undefined => {
  if (authorization === undefined || !authorization.startsWith('Bearer ')) {
    return undefined;
  }
  const plaintext = authorization.slice(7);
  const colon = plaintext.indexOf(':');
  if (colon <= 0) {
    return undefined;
  }
  const tokenId = plaintext.slice(0, colon);
  const secret = plaintext.slice(colon + 1);
  if (tokenId.length === 0 || secret.length === 0) {
    return undefined;
  }
  return plaintext;
};

const beforeDelimiter = (value: string, delimiter: string): string => {
  const index = value.indexOf(delimiter);
  return index < 0 ? value : value.slice(0, index);
};

/**
 * Pathname only. Never throws: request.url can be absolute, relative,
 * or malformed, and `new URL()` would take the process down.
 */
export const pathnameOf = (url: string): string => {
  const withoutHash = beforeDelimiter(url, '#');
  const withoutQuery = beforeDelimiter(withoutHash, '?');
  const scheme = withoutQuery.indexOf('://');
  if (scheme <= 0) {
    return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  }
  const afterHost = withoutQuery.slice(scheme + 3);
  const slash = afterHost.indexOf('/');
  return slash < 0 ? '/' : afterHost.slice(slash);
};

const isHashedAssetPath = (pathname: string): boolean =>
  pathname === '/assets' ||
  pathname.startsWith('/assets/') ||
  pathname === '/admin/assets' ||
  pathname.startsWith('/admin/assets/');

/**
 * PWA entry files and hashed bundles must not share the API budget.
 * A 429 on sw.js is a failed update check, not abuse.
 * Only the web/admin roots are exempt — not `/admin/index.html` or nested copies.
 */
export const decideRateLimitExempt = (
  query: RateLimitExemptQuery
): RateLimitExemptResult => {
  const pathname = pathnameOf(query.url);
  if (pathname === '/' || pathname === '/index.html') {
    return { exempt: true };
  }
  if (pathname === '/sw.js' || pathname === '/registerSW.js' || WORKBOX_AT_ROOT.test(pathname)) {
    return { exempt: true };
  }
  if (isHashedAssetPath(pathname)) {
    return { exempt: true };
  }
  return { exempt: false };
};
