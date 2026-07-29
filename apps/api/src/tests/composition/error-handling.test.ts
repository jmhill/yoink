import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, TEST_TOKEN } from '../helpers/test-app.js';

describe('Error Response Format', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('returns JSON { message } for validation errors', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('message');
  });

  it('returns JSON { message } for auth errors', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      payload: { content: 'no auth provided' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toHaveProperty('message');
  });

  it('returns JSON { message: "Not found" } for unknown /api routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/does-not-exist',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });
});
