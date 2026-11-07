import { describe, expect, it } from 'vitest';
import type { Capture, CaptureListPage } from '@yoink/api-contracts';
import {
  createTestApp,
  createTestAppWithWebAuthn,
  TEST_ORG_ID,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
  TEST_TOKEN,
  TEST_USER_ID,
} from '../../tests/helpers/test-app.js';

const bearer = { authorization: `Bearer ${TEST_TOKEN}` };

describe('capture create and list on the composed app', () => {
  it('creates, lists, and trashes through bearer auth', async () => {
    const app = await createTestApp();

    const missing = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: bearer,
      payload: {},
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toEqual({
      message: 'Request validation failed: content',
      code: 'VALIDATION_FAILED',
      fields: ['content'],
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: bearer,
      payload: { content: 'From bearer' },
    });
    expect(created.statusCode).toBe(201);
    const capture = created.json<Capture>();
    expect(capture.organizationId).toBe(TEST_ORG_ID);
    expect(capture.createdById).toBe(TEST_USER_ID);
    expect(capture.content).toBe('From bearer');
    expect(capture.status).toBe('inbox');

    const badStatus = await app.inject({
      method: 'GET',
      url: '/api/captures?status=nope',
      headers: bearer,
    });
    expect(badStatus.statusCode).toBe(400);
    expect(badStatus.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: ['status'],
    });

    const snoozed = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/snooze`,
      headers: bearer,
      payload: { until: '2027-12-31T00:00:00.000Z' },
    });
    expect(snoozed.statusCode).toBe(200);

    const kept = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: bearer,
      payload: { content: 'Stay in inbox' },
    });
    expect(kept.statusCode).toBe(201);

    const inbox = await app.inject({
      method: 'GET',
      url: '/api/captures?status=inbox&snoozed=false',
      headers: bearer,
    });
    expect(inbox.statusCode).toBe(200);
    const page = inbox.json<CaptureListPage>();
    expect(page.captures.map((item) => item.content)).toEqual(['Stay in inbox']);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();

    const onlySnoozed = await app.inject({
      method: 'GET',
      url: '/api/captures?snoozed=true',
      headers: bearer,
    });
    expect(onlySnoozed.statusCode).toBe(200);
    expect(onlySnoozed.json<CaptureListPage>().captures.map((item) => item.id)).toEqual([
      capture.id,
    ]);

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/captures/${capture.id}`,
      headers: bearer,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json<Capture>().content).toBe('From bearer');
  });

  it('accepts a session cookie and refuses an agent token', async () => {
    const app = await createTestAppWithWebAuthn();
    const session = { cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID } };

    const created = await app.inject({
      method: 'POST',
      url: '/api/captures',
      cookies: session.cookies,
      payload: { content: 'From session' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<Capture>().createdById).toBe(TEST_USER_ID);

    const unauthenticated = await app.inject({ method: 'GET', url: '/api/captures' });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ message: 'Not authenticated' });

    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken } = minted.json<{ rawToken: string }>();

    const refused = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { content: 'Bot note' },
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ message: 'Agents cannot create captures' });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/captures?status=inbox&snoozed=false',
      headers: { authorization: `Bearer ${rawToken}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<CaptureListPage>().captures.map((item) => item.content)).toContain(
      'From session'
    );

    const proposed = await app.inject({
      method: 'POST',
      url: `/api/captures/${created.json<Capture>().id}/process-to-project`,
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { name: 'Lane project', status: 'active' },
    });
    expect(proposed.statusCode).toBe(403);
    expect(proposed.json()).toEqual({
      message: 'Creating a project requires a person',
      code: 'PROJECT_CREATE_REQUIRES_PERSON',
    });
  });

  it('trashes, deletes, processes, and keeps project validation codes', async () => {
    const app = await createTestApp();

    const created = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: bearer,
      payload: { content: 'Buy milk https://example.com/milk' },
    });
    expect(created.statusCode).toBe(201);
    const capture = created.json<Capture>();

    const blank = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process-to-project`,
      headers: bearer,
      payload: { name: '   ', status: 'active' },
    });
    expect(blank.statusCode).toBe(400);
    expect(blank.json()).toEqual({
      message: "Name can't be blank",
      code: 'PROJECT_NAME_BLANK',
    });

    const processed = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process`,
      headers: bearer,
      payload: { type: 'task', data: { title: 'Buy milk' } },
    });
    expect(processed.statusCode).toBe(201);
    expect(processed.json()).toMatchObject({ title: 'Buy milk' });

    const again = await app.inject({
      method: 'POST',
      url: `/api/captures/${capture.id}/process`,
      headers: bearer,
      payload: { type: 'task', data: { title: 'Buy milk' } },
    });
    expect(again.statusCode).toBe(400);
    expect(again.json()).toEqual({ message: 'Capture must be in inbox to be processed' });

    const second = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: bearer,
      payload: { content: 'Throw this away' },
    });
    const thrown = second.json<Capture>();

    const notTrashed = await app.inject({
      method: 'DELETE',
      url: `/api/captures/${thrown.id}`,
      headers: bearer,
    });
    expect(notTrashed.statusCode).toBe(409);
    expect(notTrashed.json()).toEqual({
      message: 'Capture must be in trash before it can be deleted',
    });

    const trashed = await app.inject({
      method: 'POST',
      url: `/api/captures/${thrown.id}/trash`,
      headers: bearer,
      payload: {},
    });
    expect(trashed.statusCode).toBe(200);
    expect(trashed.json()).toMatchObject({ status: 'trashed' });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/captures/${thrown.id}`,
      headers: bearer,
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');

    const emptied = await app.inject({
      method: 'POST',
      url: '/api/captures/trash/empty',
      headers: bearer,
      payload: {},
    });
    expect(emptied.statusCode).toBe(200);
    expect(emptied.json()).toEqual({ deletedCount: 0 });
  });
});
