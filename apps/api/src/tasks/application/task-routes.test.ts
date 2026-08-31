import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestApp,
  TEST_TOKEN,
} from '../../tests/helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import type { NamedList, Task } from '@yoink/api-contracts';

describe('PATCH /api/tasks/:id listId', () => {
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

  const createTask = async (title: string): Promise<Task> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: auth,
      payload: { title },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Task>();
  };

  it('puts an existing unlisted task on a named list', async () => {
    const list = await createList('Groceries');
    const task = await createTask('Buy milk');
    expect(task.listId).toBeUndefined();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: { listId: list.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<Task>().listId).toBe(list.id);
  });

  it('replaces one list with another', async () => {
    const groceries = await createList('Groceries');
    const weekend = await createList('Weekend');
    const task = await createTask('Buy milk');

    await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: { listId: groceries.id },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: { listId: weekend.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<Task>().listId).toBe(weekend.id);
  });

  it('rejects an unknown list', async () => {
    const task = await createTask('Buy milk');

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: auth,
      payload: { listId: '550e8400-e29b-41d4-a716-446655440099' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toBe(
      'List is not in this organization'
    );
  });

  it('returns 401 without authentication', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/550e8400-e29b-41d4-a716-446655440000',
      payload: { listId: '550e8400-e29b-41d4-a716-446655440001' },
    });

    expect(response.statusCode).toBe(401);
  });
});
