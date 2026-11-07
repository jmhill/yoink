import { describe, expect, it } from 'vitest';
import {
  decideClientIp,
  decideRateLimitConsume,
  decideRateLimitExceededMessage,
  decideRateLimitExempt,
  decideRateLimitKey,
  decideTimeWindowMs,
  decideViaFly,
  firstHeaderValue,
  pathnameOf,
  UNKNOWN_CLIENT_IP,
  bearerPlaintext,
  sessionIdFromCookieHeader,
} from './rate-limit-policy.js';

describe('firstHeaderValue', () => {
  it('takes the first non-empty header', () => {
    expect(firstHeaderValue(undefined)).toBeUndefined();
    expect(firstHeaderValue('')).toBeUndefined();
    expect(firstHeaderValue('  ')).toBeUndefined();
    expect(firstHeaderValue('8.8.8.8')).toBe('8.8.8.8');
    expect(firstHeaderValue(['1.1.1.1', '2.2.2.2'])).toBe('1.1.1.1');
    expect(firstHeaderValue([])).toBeUndefined();
  });
});

describe('decideViaFly', () => {
  it('is true only when Fly machine env is set', () => {
    expect(decideViaFly({}).viaFly).toBe(false);
    expect(decideViaFly({ flyAllocId: '', flyAppName: '  ' }).viaFly).toBe(false);
    expect(decideViaFly({ flyAllocId: 'alloc-1' }).viaFly).toBe(true);
    expect(decideViaFly({ flyAppName: 'yoink-api' }).viaFly).toBe(true);
  });
});

describe('decideClientIp', () => {
  it('uses Fly-Client-IP only when the request came via Fly', () => {
    expect(
      decideClientIp({
        remoteAddress: '127.0.0.1',
        flyClientIp: '198.51.100.10',
        viaFly: true,
      })
    ).toEqual({ ip: '198.51.100.10' });
    expect(
      decideClientIp({
        remoteAddress: '127.0.0.1',
        flyClientIp: '198.51.100.10',
        viaFly: false,
      })
    ).toEqual({ ip: '127.0.0.1' });
  });

  it('falls back to the socket address, then a stable unknown', () => {
    expect(
      decideClientIp({ remoteAddress: '10.0.0.5', viaFly: true })
    ).toEqual({ ip: '10.0.0.5' });
    expect(decideClientIp({ remoteAddress: undefined, viaFly: false })).toEqual({
      ip: UNKNOWN_CLIENT_IP,
    });
  });
});

describe('decideRateLimitKey', () => {
  it('keys a validated user ahead of IP', () => {
    expect(
      decideRateLimitKey({
        clientIp: '1.1.1.1',
        userId: '550e8400-e29b-41d4-a716-446655440002',
      })
    ).toEqual({
      key: 'user:550e8400-e29b-41d4-a716-446655440002',
      source: 'user',
    });
  });

  it('falls back to the derived client IP', () => {
    expect(decideRateLimitKey({ clientIp: '1.1.1.1' })).toEqual({
      key: 'ip:1.1.1.1',
      source: 'ip',
    });
    expect(decideRateLimitKey({ clientIp: '1.1.1.1', userId: '  ' })).toEqual({
      key: 'ip:1.1.1.1',
      source: 'ip',
    });
  });
});

describe('decideTimeWindowMs', () => {
  it('parses the windows the API config uses', () => {
    expect(decideTimeWindowMs({ timeWindow: '1 minute' })).toEqual({ windowMs: 60_000 });
    expect(decideTimeWindowMs({ timeWindow: '15 minutes' })).toEqual({ windowMs: 900_000 });
    expect(decideTimeWindowMs({ timeWindow: 5000 })).toEqual({ windowMs: 5000 });
  });
});

describe('decideRateLimitConsume', () => {
  it('opens a new window, then limits once max is reached', () => {
    expect(
      decideRateLimitConsume({
        count: 0,
        resetAt: 0,
        nowMs: 1_000,
        max: 3,
        windowMs: 60_000,
      })
    ).toEqual({
      limited: false,
      nextCount: 1,
      nextResetAt: 61_000,
      retryAfterSeconds: 60,
    });
    expect(
      decideRateLimitConsume({
        count: 3,
        resetAt: 61_000,
        nowMs: 1_000,
        max: 3,
        windowMs: 60_000,
      })
    ).toEqual({
      limited: true,
      nextCount: 3,
      nextResetAt: 61_000,
      retryAfterSeconds: 60,
    });
  });
});

describe('decideRateLimitExceededMessage', () => {
  it('names the same seconds as Retry-After', () => {
    expect(decideRateLimitExceededMessage({ retryAfterSeconds: 47 })).toEqual({
      message: 'Rate limit exceeded, retry in 47 seconds',
    });
    expect(decideRateLimitExceededMessage({ retryAfterSeconds: 1 })).toEqual({
      message: 'Rate limit exceeded, retry in 1 seconds',
    });
  });
});

describe('credential extractors', () => {
  it('reads a session id from the cookie header without using it as a key', () => {
    expect(
      sessionIdFromCookieHeader('other=1; yoink_session=sess-1', 'yoink_session')
    ).toBe('sess-1');
    expect(sessionIdFromCookieHeader('yoink_session=', 'yoink_session')).toBeUndefined();
  });

  it('reads Bearer tokenId:secret plaintext only', () => {
    expect(bearerPlaintext('Bearer token-id:secret')).toBe('token-id:secret');
    expect(bearerPlaintext('Bearer not-a-token')).toBeUndefined();
    expect(bearerPlaintext('Basic abc')).toBeUndefined();
  });
});

describe('pathnameOf', () => {
  it('does not throw on malformed URLs', () => {
    expect(pathnameOf('http://[::1')).toBe('/');
    expect(pathnameOf(':::not-a-url')).toBe('/:::not-a-url');
    expect(pathnameOf('')).toBe('/');
    expect(pathnameOf('http://example.com:8080/sw.js?v=2#x')).toBe('/sw.js');
    expect(pathnameOf('/sw.js?v=2')).toBe('/sw.js');
  });
});

describe('decideRateLimitExempt', () => {
  it('exempts only the web/admin PWA entry files and hashed assets', () => {
    expect(decideRateLimitExempt({ url: '/sw.js' }).exempt).toBe(true);
    expect(decideRateLimitExempt({ url: '/sw.js?v=2' }).exempt).toBe(true);
    expect(decideRateLimitExempt({ url: '/workbox-a1b2c3d4.js' }).exempt).toBe(true);
    expect(decideRateLimitExempt({ url: '/registerSW.js' }).exempt).toBe(true);
    expect(decideRateLimitExempt({ url: '/assets/index-abc.js' }).exempt).toBe(true);
    expect(decideRateLimitExempt({ url: '/admin/assets/index-abc.js' }).exempt).toBe(
      true
    );
    expect(decideRateLimitExempt({ url: '/index.html' }).exempt).toBe(true);
    expect(decideRateLimitExempt({ url: '/' }).exempt).toBe(true);
  });

  it('does not exempt nested copies, admin HTML, or API routes', () => {
    expect(decideRateLimitExempt({ url: '/admin/index.html' }).exempt).toBe(false);
    expect(decideRateLimitExempt({ url: '/admin/sw.js' }).exempt).toBe(false);
    expect(decideRateLimitExempt({ url: '/nested/sw.js' }).exempt).toBe(false);
    expect(decideRateLimitExempt({ url: '/api/foo/assets/x.js' }).exempt).toBe(false);
    expect(decideRateLimitExempt({ url: '/api/health' }).exempt).toBe(false);
    expect(decideRateLimitExempt({ url: '/api/projects' }).exempt).toBe(false);
    expect(decideRateLimitExempt({ url: '/work' }).exempt).toBe(false);
    expect(decideRateLimitExempt({ url: '/login' }).exempt).toBe(false);
  });
});
