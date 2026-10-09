import { describe, it, expect, beforeEach } from 'vitest';
import {
  PILE_SAFETY_CAP,
  type Capture,
  type CaptureListPage,
} from '@yoink/api-contracts';
import type { FastifyInstance } from 'fastify';
import { createTestApp, pagingTestConfig, TEST_TOKEN } from '../../tests/helpers/test-app.js';

const auth = { authorization: `Bearer ${TEST_TOKEN}` };

const collectPages = async (
  app: FastifyInstance,
  query: string
): Promise<{ ids: string[]; pages: CaptureListPage[] }> => {
  const pages: CaptureListPage[] = [];
  const ids: string[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore === true) {
    const qs: string = cursor ? `${query}&cursor=${cursor}` : query;
    const response = await app.inject({
      method: 'GET',
      url: `/api/captures?${qs}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as CaptureListPage;
    pages.push(body);
    ids.push(...body.captures.map((capture) => capture.id));
    hasMore = body.hasMore;
    cursor = body.nextCursor;
    if (pages.length > 20) {
      throw new Error('pagination did not terminate');
    }
  }

  return { ids, pages };
};

const createCaptures = async (app: FastifyInstance, count: number): Promise<Capture[]> => {
  const created: Capture[] = [];
  for (let index = 0; index < count; index++) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: auth,
      payload: { content: `Note ${String(index).padStart(3, '0')}` },
    });
    expect(response.statusCode).toBe(201);
    created.push(response.json<Capture>());
  }
  return created;
};

describe('GET /api/captures list completeness', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp(pagingTestConfig);
  });

  it('always includes hasMore, nextCursor (null when done), and total on a small inbox', async () => {
    await createCaptures(app, 2);

    const response = await app.inject({
      method: 'GET',
      url: '/api/captures?status=inbox&snoozed=false',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<CaptureListPage>();
    expect(body.captures).toHaveLength(2);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(2);
  });

  it('returns a whole inbox of 120 captures in one request', async () => {
    await createCaptures(app, 120);

    const response = await app.inject({
      method: 'GET',
      url: '/api/captures?status=inbox&snoozed=false',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<CaptureListPage>();
    expect(body.captures).toHaveLength(120);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(120);
  });

  it('pages 120 inbox captures with no gaps or duplicates', async () => {
    const created = await createCaptures(app, 120);
    const { ids, pages } = await collectPages(
      app,
      'status=inbox&snoozed=false&limit=50'
    );

    expect(pages).toHaveLength(3);
    expect(pages[0]?.captures).toHaveLength(50);
    expect(pages[0]?.hasMore).toBe(true);
    expect(pages[2]?.captures).toHaveLength(20);
    expect(pages[2]?.hasMore).toBe(false);
    expect(pages[2]?.nextCursor).toBeNull();
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
    expect(new Set(ids)).toEqual(new Set(created.map((capture) => capture.id)));
  });

  it('reports hasMore when the inbox hits the safety cap', async () => {
    await createCaptures(app, PILE_SAFETY_CAP + 1);

    const response = await app.inject({
      method: 'GET',
      url: '/api/captures?status=inbox&snoozed=false',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<CaptureListPage>();
    expect(body.captures).toHaveLength(PILE_SAFETY_CAP);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(body.total).toBe(PILE_SAFETY_CAP + 1);
  }, 60_000);

  it('pages trashed history and still reports the rest', async () => {
    const created = await createCaptures(app, 120);
    for (const capture of created) {
      const trashed = await app.inject({
        method: 'POST',
        url: `/api/captures/${capture.id}/trash`,
        headers: auth,
        payload: {},
      });
      expect(trashed.statusCode).toBe(200);
    }

    const first = await app.inject({
      method: 'GET',
      url: '/api/captures?status=trashed',
      headers: auth,
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json<CaptureListPage>();
    expect(firstBody.captures).toHaveLength(50);
    expect(firstBody.hasMore).toBe(true);
    expect(firstBody.total).toBe(120);

    const { ids } = await collectPages(app, 'status=trashed&limit=50');
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
  }, 60_000);

  it('keeps paging trash after the cursor capture is restored', async () => {
    const created = await createCaptures(app, 3);
    for (const capture of created) {
      const trashed = await app.inject({
        method: 'POST',
        url: `/api/captures/${capture.id}/trash`,
        headers: auth,
        payload: {},
      });
      expect(trashed.statusCode).toBe(200);
    }

    const first = await app.inject({
      method: 'GET',
      url: '/api/captures?status=trashed&limit=1',
      headers: auth,
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json<CaptureListPage>();
    expect(firstBody.captures).toHaveLength(1);
    const cursorItem = firstBody.captures[0];
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const restored = await app.inject({
      method: 'POST',
      url: `/api/captures/${cursorItem?.id}/restore`,
      headers: auth,
      payload: {},
    });
    expect(restored.statusCode).toBe(200);

    const second = await app.inject({
      method: 'GET',
      url: `/api/captures?status=trashed&limit=10&cursor=${firstBody.nextCursor}`,
      headers: auth,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json<CaptureListPage>();
    expect(secondBody.captures).toHaveLength(2);
    expect(secondBody.captures.map((capture) => capture.id)).not.toContain(cursorItem?.id);
    expect(secondBody.hasMore).toBe(false);
    expect(secondBody.total).toBe(2);
  });

  it('maps a malformed cursor to 400 invalid_cursor', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/captures?status=trashed&cursor=not-a-cursor',
      headers: auth,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Cursor is invalid',
      code: 'invalid_cursor',
    });
  });

  it('reports hasMore when snoozed captures hit the safety cap', async () => {
    const created = await createCaptures(app, PILE_SAFETY_CAP + 1);
    for (const capture of created) {
      const snoozed = await app.inject({
        method: 'POST',
        url: `/api/captures/${capture.id}/snooze`,
        headers: auth,
        payload: { until: '2025-12-31T00:00:00.000Z' },
      });
      expect(snoozed.statusCode).toBe(200);
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/captures?snoozed=true',
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<CaptureListPage>();
    expect(body.captures).toHaveLength(PILE_SAFETY_CAP);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(body.total).toBe(PILE_SAFETY_CAP + 1);
  }, 60_000);
});
