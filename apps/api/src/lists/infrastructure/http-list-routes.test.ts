import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestApp,
  TEST_TOKEN,
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

  it('shows seeded list names', async () => {
    const seed = await app.inject({
      method: 'POST',
      url: '/api/test/named-lists',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: 'Groceries' },
    });
    expect(seed.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/test/named-lists',
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
