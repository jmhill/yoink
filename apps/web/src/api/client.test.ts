import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureClient, httpFailureBody, httpStatusOf } from './client';
import { tokenStorage } from '@/lib/token';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('web OpenAPI client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    tokenStorage.remove();
  });

  it('lists inbox captures with the session cookie and bearer token', async () => {
    localStorage.setItem('yoink_api_token', 'token-id:secret');
    const calls: {
      url: string;
      credentials: RequestCredentials | undefined;
      authorization: string | null;
      contentType: string | null;
    }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({
        url,
        credentials: init.credentials,
        authorization: headers.get('Authorization'),
        contentType: headers.get('content-type'),
      });
      return jsonResponse(200, {
        captures: [],
        hasMore: false,
        nextCursor: null,
        total: 0,
      });
    });

    await captureClient.list({ status: 'inbox', snoozed: false, limit: 1 });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url.startsWith('/api/captures?')).toBe(true);
    expect(call?.url).toContain('limit=1');
    expect(call?.url).toContain('snoozed=false');
    expect(call?.credentials).toBe('include');
    expect(call?.authorization).toBe('Bearer token-id:secret');
    expect(call?.contentType).toBeNull();
  });

  it('reports a 401 body from the session response', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(401, { message: 'Not authenticated' }));

    const failure = await captureClient
      .list({ limit: 1 })
      .then(
        () => undefined,
        (error: unknown) => error
      );

    expect(httpStatusOf(failure)).toBe(401);
    expect(httpFailureBody(failure)).toEqual({ message: 'Not authenticated' });
  });
});
