import { describe, expect, it } from 'vitest';
import { apiResultFromResponse, jsonBodyOf } from './api-result';
import { decideRetryAfterMs } from './live-query';

describe('apiResultFromResponse', () => {
  it('keeps response headers so Retry-After survives on a 429', async () => {
    const response = new Response('{"message":"Rate limit exceeded"}', {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '7' },
    });

    const result = await apiResultFromResponse(response);

    expect(result.status).toBe(429);
    expect(result.headers.get('retry-after')).toBe('7');
    expect(decideRetryAfterMs({ error: result, nowMs: 0 })).toEqual({ waitMs: 7_000 });
  });

  it('returns undefined body for an empty response', async () => {
    const response = new Response(null, { status: 200 });
    const result = await apiResultFromResponse(response);
    expect(result.status).toBe(200);
    expect(result.body).toBeUndefined();
  });

  it('does not throw when the body is not JSON', async () => {
    expect(jsonBodyOf('not-json')).toEqual({ ok: false });
    const response = new Response('not-json', { status: 500 });
    const result = await apiResultFromResponse(response);
    expect(result.status).toBe(500);
    expect(result.body).toBeUndefined();
  });
});
