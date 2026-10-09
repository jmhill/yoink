import { describe, it, expect, beforeEach } from 'vitest';
import {
  PILE_SAFETY_CAP,
  type NamedList,
  type NamedListListPage,
  type Task,
  type TaskListPage,
} from '@yoink/api-contracts';
import type { FastifyInstance } from 'fastify';
import { createTestApp, TEST_TOKEN } from '../../tests/helpers/test-app.js';

const auth = { authorization: `Bearer ${TEST_TOKEN}` };

const createLists = async (app: FastifyInstance, count: number): Promise<NamedList[]> => {
  const created: NamedList[] = [];
  for (let index = 0; index < count; index++) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: auth,
      payload: { name: `List ${String(index).padStart(3, '0')}` },
    });
    expect(response.statusCode).toBe(201);
    created.push(response.json<NamedList>());
  }
  return created;
};

const createTasksOnList = async (
  app: FastifyInstance,
  listId: string,
  count: number
): Promise<Task[]> => {
  const created: Task[] = [];
  for (let index = 0; index < count; index++) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: auth,
      payload: {
        title: `Card ${String(index).padStart(3, '0')}`,
        listId,
      },
    });
    expect(response.statusCode).toBe(201);
    created.push(response.json<Task>());
  }
  return created;
};

describe('GET /api/lists list completeness', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('always includes hasMore, nextCursor (null when done), and total', async () => {
    await createLists(app, 2);

    const response = await app.inject({
      method: 'GET',
      url: '/api/lists',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<NamedListListPage>();
    expect(body.lists).toHaveLength(2);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(2);
  });

  it('returns every named list in one request when under the cap', async () => {
    await createLists(app, 120);

    const response = await app.inject({
      method: 'GET',
      url: '/api/lists',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<NamedListListPage>();
    expect(body.lists).toHaveLength(120);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(120);
  });

  it('pages 120 named lists with no gaps or duplicates', async () => {
    const created = await createLists(app, 120);
    const ids: string[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    let pages = 0;

    while (hasMore) {
      const url: string = cursor
        ? `/api/lists?limit=50&cursor=${cursor}`
        : '/api/lists?limit=50';
      const response = await app.inject({ method: 'GET', url, headers: auth });
      expect(response.statusCode).toBe(200);
      const body = response.json() as NamedListListPage;
      ids.push(...body.lists.map((list) => list.id));
      hasMore = body.hasMore;
      cursor = body.nextCursor;
      pages += 1;
      if (pages > 20) throw new Error('pagination did not terminate');
    }

    expect(pages).toBe(3);
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
    expect(new Set(ids)).toEqual(new Set(created.map((list) => list.id)));
  });

  it('reports hasMore when named lists hit the safety cap', async () => {
    await createLists(app, PILE_SAFETY_CAP + 1);

    const response = await app.inject({
      method: 'GET',
      url: '/api/lists',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<NamedListListPage>();
    expect(body.lists).toHaveLength(PILE_SAFETY_CAP);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe(body.lists[PILE_SAFETY_CAP - 1]?.id);
    expect(body.total).toBe(PILE_SAFETY_CAP + 1);
  }, 60_000);
});

describe('GET pile reads list completeness', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('returns every open task on a named list in one request', async () => {
    const listResponse = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: auth,
      payload: { name: 'Groceries' },
    });
    const list = listResponse.json<NamedList>();
    await createTasksOnList(app, list.id, 120);

    const response = await app.inject({
      method: 'GET',
      url: `/api/lists/${list.id}/tasks`,
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<TaskListPage>();
    expect(body.tasks).toHaveLength(120);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(120);
    expect(body.tasks.map((task) => task.title)).toEqual(
      Array.from({ length: 120 }, (_, index) => `Card ${String(index).padStart(3, '0')}`)
    );
  });

  it('pages a named-list pile with no gaps or duplicates', async () => {
    const listResponse = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: auth,
      payload: { name: 'Groceries' },
    });
    const list = listResponse.json<NamedList>();
    const created = await createTasksOnList(app, list.id, 120);
    const ids: string[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const url: string = cursor
        ? `/api/lists/${list.id}/tasks?limit=50&cursor=${cursor}`
        : `/api/lists/${list.id}/tasks?limit=50`;
      const response = await app.inject({ method: 'GET', url, headers: auth });
      expect(response.statusCode).toBe(200);
      const body = response.json() as TaskListPage;
      ids.push(...body.tasks.map((task) => task.id));
      hasMore = body.hasMore;
      cursor = body.nextCursor;
    }

    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
    expect(ids).toEqual(created.map((task) => task.id));
  });

  it('reports hasMore when a named-list pile hits the safety cap', async () => {
    const listResponse = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: auth,
      payload: { name: 'Groceries' },
    });
    const list = listResponse.json<NamedList>();
    await createTasksOnList(app, list.id, PILE_SAFETY_CAP + 1);

    const response = await app.inject({
      method: 'GET',
      url: `/api/lists/${list.id}/tasks`,
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<TaskListPage>();
    expect(body.tasks).toHaveLength(PILE_SAFETY_CAP);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe(body.tasks[PILE_SAFETY_CAP - 1]?.id);
    expect(body.total).toBe(PILE_SAFETY_CAP + 1);
  }, 60_000);

  it('returns every open unlisted task in one request', async () => {
    for (let index = 0; index < 120; index++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: auth,
        payload: { title: `Loose ${String(index).padStart(3, '0')}` },
      });
      expect(response.statusCode).toBe(201);
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/unlisted/tasks',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<TaskListPage>();
    expect(body.tasks).toHaveLength(120);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(120);
  });
});
