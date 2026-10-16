import { describe, expect, it } from 'vitest';
import {
  decideRateLimitExempt,
  decideRateLimitKey,
  firstHeaderValue,
} from './rate-limit-policy.js';

const sessionCookieName = 'yoink_session';

describe('firstHeaderValue', () => {
  it('takes the first non-empty header', () => {
    expect(firstHeaderValue(undefined)).toBeUndefined();
    expect(firstHeaderValue('')).toBeUndefined();
    expect(firstHeaderValue('8.8.8.8')).toBe('8.8.8.8');
    expect(firstHeaderValue(['1.1.1.1', '2.2.2.2'])).toBe('1.1.1.1');
    expect(firstHeaderValue([])).toBeUndefined();
  });
});

describe('decideRateLimitKey', () => {
  it('keys a signed-in session ahead of a token or IP', () => {
    expect(
      decideRateLimitKey({
        ip: '1.1.1.1',
        flyClientIp: '9.9.9.9',
        authorization: 'Bearer token-id:secret',
        cookieHeader: 'other=1; yoink_session=sess-1',
        sessionCookieName,
      })
    ).toEqual({ key: 'session:sess-1', source: 'session' });
  });

  it('keys a bot or personal token by token id', () => {
    expect(
      decideRateLimitKey({
        ip: '1.1.1.1',
        authorization: 'Bearer token-id:secret',
        sessionCookieName,
      })
    ).toEqual({ key: 'token:token-id', source: 'token' });
  });

  it('falls back to Fly-Client-IP, then the request IP', () => {
    expect(
      decideRateLimitKey({
        ip: '1.1.1.1',
        flyClientIp: '8.8.8.8',
        sessionCookieName,
      })
    ).toEqual({ key: 'ip:8.8.8.8', source: 'ip' });
    expect(
      decideRateLimitKey({
        ip: '1.1.1.1',
        sessionCookieName,
      })
    ).toEqual({ key: 'ip:1.1.1.1', source: 'ip' });
  });

  it('ignores an empty session cookie and a token that is not tokenId:secret', () => {
    expect(
      decideRateLimitKey({
        ip: '1.1.1.1',
        authorization: 'Bearer not-a-token',
        cookieHeader: 'yoink_session=',
        sessionCookieName,
      })
    ).toEqual({ key: 'ip:1.1.1.1', source: 'ip' });
  });
});

describe('decideRateLimitExempt', () => {
  it('exempts the service worker, Workbox files, hashed assets, and index.html', () => {
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
    expect(decideRateLimitExempt({ url: '/admin/index.html' }).exempt).toBe(true);
  });

  it('does not exempt API or app routes', () => {
    expect(decideRateLimitExempt({ url: '/api/health' }).exempt).toBe(false);
    expect(decideRateLimitExempt({ url: '/api/projects' }).exempt).toBe(false);
    expect(decideRateLimitExempt({ url: '/work' }).exempt).toBe(false);
    expect(decideRateLimitExempt({ url: '/login' }).exempt).toBe(false);
  });
});
