import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureClient, httpFailureBody, httpStatusOf, taskClient } from './client';
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
      redirect: RequestRedirect | undefined;
    }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({
        url,
        credentials: init.credentials,
        authorization: headers.get('Authorization'),
        contentType: headers.get('content-type'),
        redirect: init.redirect,
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
    expect(call?.redirect).toBe('follow');
  });

  it('accepts a bodyless 204 when deleting a task', async () => {
    const calls: { method: string | undefined; redirect: RequestRedirect | undefined }[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      calls.push({ method: init.method, redirect: init.redirect });
      return new Response(null, { status: 204 });
    });

    await taskClient.delete({ id: '550e8400-e29b-41d4-a716-446655440000' });

    expect(calls).toEqual([{ method: 'DELETE', redirect: 'follow' }]);
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
