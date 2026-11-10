import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminClient, httpFailureBody, httpStatusOf, publicClient, YOINK_BUILD_HEADER } from './client';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('admin OpenAPI client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts login to /admin-api/login with the session cookie and build id', async () => {
    const calls: {
      url: string;
      method: string;
      credentials: RequestCredentials | undefined;
      body: string;
      build: string | null;
    }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({
        url,
        method: init.method ?? 'GET',
        credentials: init.credentials,
        body: typeof init.body === 'string' ? init.body : '',
        build: headers.get(YOINK_BUILD_HEADER),
      });
      return jsonResponse(200, { success: true });
    });

    await publicClient.login({ password: 'secret' });

    expect(calls).toEqual([
      {
        url: '/admin-api/login',
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ password: 'secret' }),
        build: 'dev',
      },
    ]);
  });

  it('reads the admin session from /admin-api/session and reports 401', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return jsonResponse(401, { message: 'Not authenticated' });
    });

    const failure = await adminClient.getSession().then(
      () => undefined,
      (error: unknown) => error
    );

    expect(urls).toEqual(['/admin-api/session']);
    expect(httpStatusOf(failure)).toBe(401);
    expect(httpFailureBody(failure)).toEqual({ message: 'Not authenticated' });
  });
});
