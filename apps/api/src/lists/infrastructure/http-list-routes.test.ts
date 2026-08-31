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
