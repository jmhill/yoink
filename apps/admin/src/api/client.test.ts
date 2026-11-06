import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminClient, httpFailureBody, httpStatusOf, publicClient } from './client';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('admin OpenAPI client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts login to /api/admin/login with the session cookie', async () => {
    const calls: { url: string; method: string; credentials: RequestCredentials | undefined; body: string }[] =
      [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        credentials: init.credentials,
        body: typeof init.body === 'string' ? init.body : '',
      });
      return jsonResponse(200, { success: true });
    });

    await publicClient.login({ password: 'secret' });

    expect(calls).toEqual([
      {
        url: '/api/admin/login',
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ password: 'secret' }),
      },
    ]);
  });

  it('reads the admin session from /api/admin/session and reports 401', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(401, { message: 'Not authenticated' }));

    const failure = await adminClient.getSession().then(
      () => undefined,
      (error: unknown) => error
    );

    expect(httpStatusOf(failure)).toBe(401);
    expect(httpFailureBody(failure)).toEqual({ message: 'Not authenticated' });
  });
});
