import { describe, it, expect, beforeEach } from 'vitest';
import { PILE_SAFETY_CAP, type Task, type TaskListPage } from '@yoink/api-contracts';
import type { FastifyInstance } from 'fastify';
import { createTestApp, TEST_TOKEN } from '../../tests/helpers/test-app.js';

const auth = { authorization: `Bearer ${TEST_TOKEN}` };

const collectPages = async (
  app: FastifyInstance,
  path: string,
  firstQuery: string
): Promise<{ ids: string[]; pages: TaskListPage[] }> => {
  const pages: TaskListPage[] = [];
  const ids: string[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  let query = firstQuery;

  while (hasMore) {
    const url = cursor ? `${path}?${query}&cursor=${cursor}` : `${path}?${query}`;
    const response = await app.inject({ method: 'GET', url, headers: auth });
    expect(response.statusCode).toBe(200);
    const body = response.json<TaskListPage>();
    expect(body.nextCursor).toEqual(body.hasMore ? expect.any(String) : null);
    pages.push(body);
    ids.push(...body.tasks.map((task) => task.id));
    hasMore = body.hasMore;
    cursor = body.nextCursor;
    if (pages.length > 20) {
      throw new Error('pagination did not terminate');
    }
  }

  return { ids, pages };
};

const createTasks = async (
  app: FastifyInstance,
  count: number,
  payload: (index: number) => Record<string, unknown> = (index) => ({
    title: `Task ${String(index).padStart(3, '0')}`,
  })
): Promise<Task[]> => {
  const created: Task[] = [];
  for (let index = 0; index < count; index++) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: auth,
      payload: payload(index),
    });
    expect(response.statusCode).toBe(201);
    created.push(response.json<Task>());
  }
  return created;
};

describe('GET /api/tasks list completeness', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('always includes hasMore, nextCursor (null when done), and total on a small board', async () => {
    await createTasks(app, 2);

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks?filter=all',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<TaskListPage>();
    expect(Object.keys(body).sort()).toEqual(
      ['hasMore', 'nextCursor', 'tasks', 'total'].sort()
    );
    expect(body.tasks).toHaveLength(2);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(2);
  });

  it('returns a whole open pile of 120 tasks in one request', async () => {
    await createTasks(app, 120);

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks?filter=all',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<TaskListPage>();
    expect(body.tasks).toHaveLength(120);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(120);
  });

  it('pages 120 tasks with no gaps or duplicates', async () => {
    const created = await createTasks(app, 120);
    const { ids, pages } = await collectPages(app, '/api/tasks', 'filter=all&limit=50');

    expect(pages).toHaveLength(3);
    expect(pages[0]?.tasks).toHaveLength(50);
    expect(pages[0]?.hasMore).toBe(true);
    expect(pages[1]?.tasks).toHaveLength(50);
    expect(pages[1]?.hasMore).toBe(true);
    expect(pages[2]?.tasks).toHaveLength(20);
    expect(pages[2]?.hasMore).toBe(false);
    expect(pages[2]?.nextCursor).toBeNull();
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
    expect(new Set(ids)).toEqual(new Set(created.map((task) => task.id)));
    expect(pages.every((page) => page.total === 120)).toBe(true);
  });

  it('reports hasMore when the open-task feed hits the safety cap', async () => {
    await createTasks(app, PILE_SAFETY_CAP + 1);

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks?filter=all',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<TaskListPage>();
    expect(body.tasks).toHaveLength(PILE_SAFETY_CAP);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe(body.tasks[PILE_SAFETY_CAP - 1]?.id);
    expect(body.total).toBe(PILE_SAFETY_CAP + 1);
  }, 60_000);

  it('pages completed history and still reports the rest', async () => {
    const created = await createTasks(app, 120);
    for (const task of created) {
      const completed = await app.inject({
        method: 'POST',
        url: `/api/tasks/${task.id}/complete`,
        headers: auth,
        payload: {},
      });
      expect(completed.statusCode).toBe(200);
    }

    const first = await app.inject({
      method: 'GET',
      url: '/api/tasks?filter=completed',
      headers: auth,
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json<TaskListPage>();
    expect(firstBody.tasks).toHaveLength(50);
    expect(firstBody.hasMore).toBe(true);
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    expect(firstBody.total).toBe(120);

    const { ids } = await collectPages(app, '/api/tasks', 'filter=completed&limit=50');
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
  }, 60_000);
});
