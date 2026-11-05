import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCaptureApiWithConfig, httpStatusOf } from './api-client';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('createCaptureApiWithConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a capture to /api/captures with the bearer token', async () => {
    const calls: { url: string; method: string; authorization: string | null; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      async (url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        calls.push({
          url,
          method: init.method ?? 'GET',
          authorization: headers.get('authorization'),
          body: typeof init.body === 'string' ? init.body : '',
        });
        return jsonResponse(201, { id: 'capture' });
      }
    );

    const api = createCaptureApiWithConfig({
      apiUrl: 'https://yoink.test/',
      token: 'token-id:secret',
    });
    await api.create({
      content: 'hello',
      sourceApp: 'browser-extension',
    });

    expect(calls).toEqual([
      {
        url: 'https://yoink.test/api/captures',
        method: 'POST',
        authorization: 'Bearer token-id:secret',
        body: JSON.stringify({
          content: 'hello',
          sourceApp: 'browser-extension',
        }),
      },
    ]);
  });

  it('lists captures with a JSON limit query and reports 401', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return jsonResponse(401, { message: 'Not authenticated' });
    });

    const api = createCaptureApiWithConfig({
      apiUrl: 'https://yoink.test',
      token: 'token-id:secret',
    });

    const failure = await api.list({ limit: 1 }).then(
      () => undefined,
      (error: unknown) => error
    );

    expect(urls).toEqual(['https://yoink.test/api/captures?limit=1']);
    expect(httpStatusOf(failure)).toBe(401);
  });
});
