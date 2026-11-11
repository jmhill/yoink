import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authWebClient,
  captureClient,
  httpFailureBody,
  httpStatusOf,
  inboxClient,
  listClient,
  processClient,
  organizationClient,
  settingsClient,
  projectClient,
  taskClient,
  webHistoryClient,
  webProjectClient,
  webTaskClient,
  YOINK_BUILD_HEADER,
} from './client';
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
      build: string | null;
    }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({
        url,
        credentials: init.credentials,
        authorization: headers.get('Authorization'),
        contentType: headers.get('content-type'),
        redirect: init.redirect,
        build: headers.get(YOINK_BUILD_HEADER),
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
    expect(call?.build).toBe('dev');
  });

  it('lists and creates Inbox captures on /web-api and sends the build id', async () => {
    const calls: { url: string; method: string; build: string | null; credentials: RequestCredentials | undefined }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({
        url,
        method: init.method ?? 'GET',
        build: headers.get(YOINK_BUILD_HEADER),
        credentials: init.credentials,
      });
      if ((init.method ?? 'GET') === 'POST') {
        return jsonResponse(201, {
          id: '550e8400-e29b-41d4-a716-446655440000',
          organizationId: '550e8400-e29b-41d4-a716-446655440001',
          createdById: '550e8400-e29b-41d4-a716-446655440002',
          content: 'Hello',
          status: 'inbox',
          capturedAt: '2024-06-15T12:00:00.000Z',
        });
      }
      return jsonResponse(200, {
        captures: [],
        hasMore: false,
        nextCursor: null,
        total: 0,
      });
    });

    await inboxClient.list({ status: 'inbox', snoozed: false, limit: 1 });
    await inboxClient.create({ content: 'Hello', sourceApp: 'web' });

    expect(calls[0]?.url.startsWith('/web-api/inbox?')).toBe(true);
    expect(calls[0]?.url).toContain('snoozed=false');
    expect(calls[0]?.credentials).toBe('include');
    expect(calls[0]?.build).toBe('dev');
    expect(calls[1]?.url).toBe('/web-api/inbox');
    expect(calls[1]?.method).toBe('POST');
    expect(calls[1]?.build).toBe('dev');
  });

  it('calls settings on /web-api and leaves other screens on the organization alias', async () => {
    const orgId = '550e8400-e29b-41d4-a716-446655440001';
    const calls: { url: string; method: string; build: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({
        url,
        method: init.method ?? 'GET',
        build: headers.get(YOINK_BUILD_HEADER),
      });
      if ((init.method ?? 'GET') === 'POST') {
        return jsonResponse(200, { success: true });
      }
      return jsonResponse(200, { members: [] });
    });

    await settingsClient.listMembers({ organizationId: orgId });
    await settingsClient.switchOrganization({ organizationId: orgId });
    await organizationClient.listMembers({ organizationId: orgId });

    expect(calls[0]?.url).toBe(`/web-api/organizations/${orgId}/members`);
    expect(calls[0]?.build).toBe('dev');
    expect(calls[1]?.url).toBe('/web-api/organizations/switch');
    expect(calls[1]?.method).toBe('POST');
    expect(calls[2]?.url).toBe(`/api/organizations/${orgId}/members`);
  });

  it('calls login, session, and passkeys on /web-api and leaves captures on the alias', async () => {
    const calls: { url: string; method: string; build: string | null; authorization: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({
        url,
        method: init.method ?? 'GET',
        build: headers.get(YOINK_BUILD_HEADER),
        authorization: headers.get('Authorization'),
      });
      if (url.endsWith('/auth/session')) {
        return jsonResponse(200, {
          user: { id: '550e8400-e29b-41d4-a716-446655440002', email: 'test@example.com' },
          organizationId: '550e8400-e29b-41d4-a716-446655440001',
          organizations: [],
        });
      }
      if (url.includes('/auth/passkey/credentials')) {
        return jsonResponse(200, { credentials: [] });
      }
      if ((init.method ?? 'GET') === 'POST') {
        return jsonResponse(200, { options: {}, challenge: 'signed' });
      }
      return jsonResponse(200, {
        captures: [],
        hasMore: false,
        nextCursor: null,
        total: 0,
      });
    });
    localStorage.setItem('yoink_api_token', 'token-id:secret');

    await authWebClient.loginOptions({});
    await authWebClient.session();
    await authWebClient.listPasskeys();
    await captureClient.list({ status: 'inbox', snoozed: false, limit: 1 });

    expect(calls[0]?.url).toBe('/web-api/auth/login/options');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.build).toBe('dev');
    expect(calls[0]?.authorization).toBe('Bearer token-id:secret');
    expect(calls[1]?.url).toBe('/web-api/auth/session');
    expect(calls[2]?.url).toBe('/web-api/auth/passkey/credentials');
    expect(calls[3]?.url.startsWith('/api/captures?')).toBe(true);
  });

  it('calls tasks and lists on /web-api and leaves taskClient.delete on the alias', async () => {
    const calls: { url: string; method: string; build: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({
        url,
        method: init.method ?? 'GET',
        build: headers.get(YOINK_BUILD_HEADER),
      });
      if ((init.method ?? 'GET') === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      if (url.includes('/lists')) {
        return jsonResponse(200, { lists: [], hasMore: false, nextCursor: null, total: 0 });
      }
      return jsonResponse(200, { tasks: [], hasMore: false, nextCursor: null, total: 0 });
    });

    await webTaskClient.list({ filter: 'today', limit: 1, timeZone: 'America/Chicago' });
    await listClient.list({ limit: 1 });
    await taskClient.delete({ id: '550e8400-e29b-41d4-a716-446655440000' });

    expect(calls[0]?.url.startsWith('/web-api/tasks?')).toBe(true);
    expect(calls[0]?.url).toContain('filter=%22today%22');
    expect(calls[0]?.build).toBe('dev');
    expect(calls[1]?.url.startsWith('/web-api/lists?')).toBe(true);
    expect(calls[2]?.url).toBe('/api/tasks/550e8400-e29b-41d4-a716-446655440000');
    expect(calls[2]?.method).toBe('DELETE');
  });

  it('calls the project page and staged import on /web-api', async () => {
    const calls: { url: string; method: string }[] = [];
    const projectId = '550e8400-e29b-41d4-a716-446655440041';
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? 'GET' });
      if (url.includes('/imports')) {
        return jsonResponse(200, { imports: [] });
      }
      if (url.includes('/tasks')) {
        return jsonResponse(200, { tasks: [], hasMore: false, nextCursor: null, total: 0 });
      }
      return jsonResponse(200, {
        id: projectId,
        organizationId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Harbor',
        status: 'active',
        waitingOn: null,
        waitingSince: null,
        nextActionTaskId: null,
        notebookPages: [],
        createdById: '550e8400-e29b-41d4-a716-446655440002',
        createdAt: '2024-06-15T12:00:00.000Z',
        lastChangedAt: null,
        lastChangedBy: null,
      });
    });

    await webProjectClient.get({ id: projectId });
    await webProjectClient.listOpenTasks({ id: projectId, limit: 10 });
    await webProjectClient.listImports({});

    expect(calls[0]?.url).toBe(`/web-api/projects/${projectId}`);
    expect(calls[1]?.url.startsWith(`/web-api/projects/${projectId}/tasks?`)).toBe(true);
    expect(calls[2]?.url).toBe('/web-api/projects/imports');
  });

  it('calls project history and finished tasks on /web-api and leaves the alias client on /api', async () => {
    const calls: { url: string }[] = [];
    const projectId = '550e8400-e29b-41d4-a716-446655440041';
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push({ url });
      if (url.includes('/history')) {
        return jsonResponse(200, {
          entries: [],
          hasMore: false,
          nextCursor: null,
          total: 0,
          historyStartsAt: '2026-10-10T13:56:00.000Z',
        });
      }
      return jsonResponse(200, { tasks: [], hasMore: false, nextCursor: null, total: 0 });
    });

    await webHistoryClient.listProjectHistory({ id: projectId, limit: 10 });
    await webHistoryClient.listFinishedTasks({ id: projectId, limit: 10 });
    await projectClient.listHistory({ id: projectId, limit: 10 });

    expect(calls[0]?.url.startsWith(`/web-api/projects/${projectId}/history?`)).toBe(true);
    expect(calls[1]?.url.startsWith(`/web-api/projects/${projectId}/finished?`)).toBe(true);
    expect(calls[2]?.url.startsWith(`/api/projects/${projectId}/history?`)).toBe(true);
  });

  it('trashes on /web-api and leaves the alias capture client', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440099';
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push(`${init.method ?? 'GET'} ${url}`);
      return jsonResponse(200, {
        id,
        organizationId: '550e8400-e29b-41d4-a716-446655440001',
        createdById: '550e8400-e29b-41d4-a716-446655440002',
        content: 'Buy milk',
        status: 'trashed',
        capturedAt: '2024-06-15T12:00:00.000Z',
      });
    });

    await processClient.trash({ id });
    await captureClient.trash({ id });

    expect(calls).toEqual([
      `POST /web-api/captures/${id}/trash`,
      `POST /api/captures/${id}/trash`,
    ]);
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
