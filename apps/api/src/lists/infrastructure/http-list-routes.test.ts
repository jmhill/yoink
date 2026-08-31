import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestApp,
  TEST_TOKEN,
  TEST_ORG_ID,
  TEST_USER_ID,
} from '../../tests/helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import type { NamedList } from '@yoink/api-contracts';

describe('GET /api/lists', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('returns an empty lists view when the org has no named lists', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ lists: [] });
  });

  it('returns 401 without authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/lists',
    });

    expect(response.statusCode).toBe(401);
  });

  it('shows created list names', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: 'Groceries' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: 'Weekend' },
    });
    expect(second.statusCode).toBe(201);

    const response = await app.inject({
      method: 'GET',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ lists: NamedList[] }>();
    expect(body.lists.map((list) => list.name)).toEqual(['Groceries', 'Weekend']);
  });
});

describe('POST /api/lists', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('creates a named list for the authenticated member', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: 'Groceries' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<NamedList>();
    expect(body.name).toBe('Groceries');
    expect(body.organizationId).toBe(TEST_ORG_ID);
    expect(body.createdById).toBe(TEST_USER_ID);
    expect(body.id).toBeDefined();
    expect(body.createdAt).toBeDefined();
  });

  it('rejects an empty name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('message');
  });

  it('returns 401 without authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      payload: { name: 'Groceries' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('does not expose the test seed path', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/test/named-lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: 'Nope' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a second list with the same name ignoring case', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: 'Groceries' },
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: 'groceries' },
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({
      message: 'A list with this name already exists',
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(listed.json<{ lists: NamedList[] }>().lists).toHaveLength(1);
  });

  it('still creates a list with a different name', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: 'Groceries' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: 'Weekend' },
    });

    expect(second.statusCode).toBe(201);
    expect(second.json<NamedList>().name).toBe('Weekend');
  });
});

describe('DELETE /api/lists/:id', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  const createList = async (name: string): Promise<NamedList> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name },
    });
    expect(response.statusCode).toBe(201);
    return response.json<NamedList>();
  };

  it('deletes a named list with no open tasks', async () => {
    const list = await createList('Groceries');

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/lists/${list.id}`,
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.statusCode).toBe(204);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(listed.json<{ lists: NamedList[] }>().lists).toEqual([]);
  });

  it('refuses delete when an open task is on the list', async () => {
    const list = await createList('Groceries');
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { title: 'Buy milk', listId: list.id },
    });
    expect(created.statusCode).toBe(201);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/lists/${list.id}`,
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: 'This list still has open tasks',
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(listed.json<{ lists: NamedList[] }>().lists).toHaveLength(1);
  });

  it('deletes when only completed tasks are on the list and clears their listId', async () => {
    const list = await createList('Groceries');
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { title: 'Buy milk', listId: list.id },
    });
    expect(created.statusCode).toBe(201);
    const task = created.json<{ id: string }>();

    const completed = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/complete`,
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: {},
    });
    expect(completed.statusCode).toBe(200);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/lists/${list.id}`,
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(response.statusCode).toBe(204);

    const done = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(done.statusCode).toBe(200);
    const body = done.json<{ listId?: string; completedAt?: string }>();
    expect(body.listId).toBeUndefined();
    expect(body.completedAt).toBeDefined();

    const restored = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/uncomplete`,
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: {},
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json<{ listId?: string }>().listId).toBeUndefined();

    const again = await createList('Groceries');
    const afterReuse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(afterReuse.json<{ listId?: string }>().listId).toBeUndefined();
    expect(again.id).not.toBe(list.id);
  });

  it('frees the name so it can be created again', async () => {
    const list = await createList('Groceries');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/lists/${list.id}`,
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(deleted.statusCode).toBe(204);

    const again = await createList('groceries');
    expect(again.name).toBe('groceries');
    expect(again.id).not.toBe(list.id);
  });

  it('returns 401 without authentication', async () => {
    const list = await createList('Groceries');

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/lists/${list.id}`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for an unknown list', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/lists/550e8400-e29b-41d4-a716-446655440099',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'List not found' });
  });
});
