import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestApp,
  TEST_TOKEN,
  TEST_ORG_ID,
  TEST_USER_ID,
} from '../../tests/helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import type { NamedList, Task } from '@yoink/api-contracts';

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

describe('GET /api/lists/:id/tasks and PUT /api/lists/:id/tasks/order', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  const auth = { authorization: `Bearer ${TEST_TOKEN}` };

  const createList = async (name: string): Promise<NamedList> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: auth,
      payload: { name },
    });
    expect(response.statusCode).toBe(201);
    return response.json<NamedList>();
  };

  const createTask = async (title: string, listId?: string): Promise<Task> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: auth,
      payload: { title, ...(listId ? { listId } : {}) },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Task>();
  };

  it('lists open tasks on a named list in open order', async () => {
    const list = await createList('Groceries');
    await createTask('Milk', list.id);
    await createTask('Eggs', list.id);
    await createTask('Bread', list.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/lists/${list.id}/tasks`,
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ tasks: Task[] }>().tasks.map((task) => task.title)).toEqual([
      'Milk',
      'Eggs',
      'Bread',
    ]);
  });

  it('changes the open-task order', async () => {
    const list = await createList('Groceries');
    const milk = await createTask('Milk', list.id);
    const eggs = await createTask('Eggs', list.id);
    const bread = await createTask('Bread', list.id);

    const reordered = await app.inject({
      method: 'PUT',
      url: `/api/lists/${list.id}/tasks/order`,
      headers: auth,
      payload: { taskIds: [eggs.id, milk.id, bread.id] },
    });

    expect(reordered.statusCode).toBe(200);
    expect(reordered.json<{ tasks: Task[] }>().tasks.map((task) => task.title)).toEqual([
      'Eggs',
      'Milk',
      'Bread',
    ]);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/lists/${list.id}/tasks`,
      headers: auth,
    });
    expect(listed.json<{ tasks: Task[] }>().tasks.map((task) => task.title)).toEqual([
      'Eggs',
      'Milk',
      'Bread',
    ]);
  });

  it('does not let pin change the list open order', async () => {
    const list = await createList('Groceries');
    const milk = await createTask('Milk', list.id);
    await createTask('Eggs', list.id);

    const pinned = await app.inject({
      method: 'POST',
      url: `/api/tasks/${milk.id}/pin`,
      headers: auth,
      payload: {},
    });
    expect(pinned.statusCode).toBe(200);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/lists/${list.id}/tasks`,
      headers: auth,
    });
    expect(listed.json<{ tasks: Task[] }>().tasks.map((task) => task.title)).toEqual([
      'Milk',
      'Eggs',
    ]);
  });

  it('drops a completed task from the open sequence and restores it at the remembered index', async () => {
    const list = await createList('Groceries');
    await createTask('Milk', list.id);
    const eggs = await createTask('Eggs', list.id);
    await createTask('Bread', list.id);

    const completed = await app.inject({
      method: 'POST',
      url: `/api/tasks/${eggs.id}/complete`,
      headers: auth,
      payload: {},
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<Task>().listId).toBe(list.id);
    expect(completed.json<Task>().openOrder).toBe(1);

    const afterComplete = await app.inject({
      method: 'GET',
      url: `/api/lists/${list.id}/tasks`,
      headers: auth,
    });
    expect(afterComplete.json<{ tasks: Task[] }>().tasks.map((task) => task.title)).toEqual([
      'Milk',
      'Bread',
    ]);

    const restored = await app.inject({
      method: 'POST',
      url: `/api/tasks/${eggs.id}/uncomplete`,
      headers: auth,
      payload: {},
    });
    expect(restored.statusCode).toBe(200);

    const afterRestore = await app.inject({
      method: 'GET',
      url: `/api/lists/${list.id}/tasks`,
      headers: auth,
    });
    expect(afterRestore.json<{ tasks: Task[] }>().tasks.map((task) => task.title)).toEqual([
      'Milk',
      'Eggs',
      'Bread',
    ]);
  });

  it('clamps uncomplete to the end when the open list is now shorter', async () => {
    const list = await createList('Groceries');
    await createTask('Milk', list.id);
    const eggs = await createTask('Eggs', list.id);
    const bread = await createTask('Bread', list.id);

    await app.inject({
      method: 'POST',
      url: `/api/tasks/${bread.id}/complete`,
      headers: auth,
      payload: {},
    });
    await app.inject({
      method: 'POST',
      url: `/api/tasks/${eggs.id}/complete`,
      headers: auth,
      payload: {},
    });

    await app.inject({
      method: 'POST',
      url: `/api/tasks/${bread.id}/uncomplete`,
      headers: auth,
      payload: {},
    });

    const listed = await app.inject({
      method: 'GET',
      url: `/api/lists/${list.id}/tasks`,
      headers: auth,
    });
    expect(listed.json<{ tasks: Task[] }>().tasks.map((task) => task.title)).toEqual([
      'Milk',
      'Bread',
    ]);
  });

  it('returns 401 without authentication', async () => {
    const listed = await app.inject({
      method: 'GET',
      url: '/api/lists/550e8400-e29b-41d4-a716-446655440001/tasks',
    });
    expect(listed.statusCode).toBe(401);

    const reordered = await app.inject({
      method: 'PUT',
      url: '/api/lists/550e8400-e29b-41d4-a716-446655440001/tasks/order',
      payload: { taskIds: [] },
    });
    expect(reordered.statusCode).toBe(401);
  });

  it('returns 404 for an unknown list', async () => {
    const listed = await app.inject({
      method: 'GET',
      url: '/api/lists/550e8400-e29b-41d4-a716-446655440099/tasks',
      headers: auth,
    });
    expect(listed.statusCode).toBe(404);

    const reordered = await app.inject({
      method: 'PUT',
      url: '/api/lists/550e8400-e29b-41d4-a716-446655440099/tasks/order',
      headers: auth,
      payload: { taskIds: [] },
    });
    expect(reordered.statusCode).toBe(404);
  });

  it('refuses to reorder a completed task', async () => {
    const list = await createList('Groceries');
    const milk = await createTask('Milk', list.id);
    const eggs = await createTask('Eggs', list.id);

    await app.inject({
      method: 'POST',
      url: `/api/tasks/${eggs.id}/complete`,
      headers: auth,
      payload: {},
    });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/lists/${list.id}/tasks/order`,
      headers: auth,
      payload: { taskIds: [milk.id, eggs.id] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: 'Only open tasks can be reordered' });
  });
});
