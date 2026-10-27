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

  it('pins the Fastify message for malformed JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: '{',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_CTP_INVALID_JSON_BODY',
      error: 'Bad Request',
      message:
        "Body is not valid JSON but content-type is set to 'application/json'",
    });
  });

  it('pins the Fastify message for an empty-body JSON DELETE', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/captures/00000000-0000-4000-8000-000000000099',
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: '',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_CTP_EMPTY_JSON_BODY',
      error: 'Bad Request',
      message:
        "Body cannot be empty when content-type is set to 'application/json'",
    });
  });

  it('still accepts a DELETE that does not claim to be JSON', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/captures/00000000-0000-4000-8000-000000000099',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Capture not found' });
  });

  it('rejects a malformed URL before the not-found handler', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/%',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_BAD_URL',
      error: 'Bad Request',
      message: "'/%' is not a valid url component",
    });
  });
});
