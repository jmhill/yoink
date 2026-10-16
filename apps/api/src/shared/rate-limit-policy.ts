export type RateLimitKeyQuery = {
  ip: string;
  flyClientIp?: string;
  authorization?: string;
  cookieHeader?: string;
  sessionCookieName: string;
};

export type RateLimitKeyResult = {
  key: string;
  source: 'session' | 'token' | 'ip';
};

export type RateLimitExemptQuery = {
  url: string;
};

export type RateLimitExemptResult = {
  exempt: boolean;
};

const WORKBOX_SCRIPT = /^workbox-.+\.js$/;

export const firstHeaderValue = (
  value: string | string[] | undefined
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return first === undefined || first.length === 0 ? undefined : first;
  }
  return value.length === 0 ? undefined : value;
};

const cookieValue = (header: string | undefined, name: string): string | undefined => {
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
    const value = trimmed.slice(eq + 1);
    return value.length > 0 ? value : undefined;
  }, undefined);
};

const tokenIdFromAuthorization = (authorization: string | undefined): string | undefined => {
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
  return tokenId;
};

export const decideRateLimitKey = (query: RateLimitKeyQuery): RateLimitKeyResult => {
  const sessionId = cookieValue(query.cookieHeader, query.sessionCookieName);
  if (sessionId !== undefined) {
    return { key: `session:${sessionId}`, source: 'session' };
  }
  const tokenId = tokenIdFromAuthorization(query.authorization);
  if (tokenId !== undefined) {
    return { key: `token:${tokenId}`, source: 'token' };
  }
  const ip =
    query.flyClientIp !== undefined && query.flyClientIp.length > 0
      ? query.flyClientIp
      : query.ip;
  return { key: `ip:${ip}`, source: 'ip' };
};

const pathnameOf = (url: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return new URL(url).pathname;
  }
  const query = url.indexOf('?');
  const hash = url.indexOf('#');
  const end = [query, hash]
    .filter((index) => index >= 0)
    .reduce((earliest, index) => Math.min(earliest, index), url.length);
  return url.slice(0, end);
};

const filenameOf = (pathname: string): string => {
  const parts = pathname.split('/');
  return parts[parts.length - 1] ?? '';
};

/**
 * PWA entry files and hashed bundles must not share the API budget.
 * A 429 on sw.js is a failed update check, not abuse.
 */
export const decideRateLimitExempt = (
  query: RateLimitExemptQuery
): RateLimitExemptResult => {
  const pathname = pathnameOf(query.url);
  const filename = filenameOf(pathname);
  if (pathname === '/' || filename === 'index.html') {
    return { exempt: true };
  }
  if (filename === 'sw.js' || filename === 'registerSW.js' || WORKBOX_SCRIPT.test(filename)) {
    return { exempt: true };
  }
  if (pathname === '/assets' || pathname.startsWith('/assets/') || pathname.includes('/assets/')) {
    return { exempt: true };
  }
  return { exempt: false };
};
