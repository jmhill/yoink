import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { authMiddleware, HARDCODED_AUTH_CONTEXT } from './auth-middleware.js';

describe('authMiddleware', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    app.addHook('preHandler', authMiddleware);

    app.get('/test', async (request) => {
      return { authContext: request.authContext };
    });

    await app.ready();
  });

  it('attaches auth context for valid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer test-token-xyz' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().authContext).toEqual(HARDCODED_AUTH_CONTEXT);
  });

  it('returns 401 for missing Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Missing authorization header');
  });

  it('returns 401 for non-Bearer authorization', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Missing authorization header');
  });

  it('returns 401 for invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer wrong-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Invalid token');
  });
});
