import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  TEST_TOKEN,
  TEST_ORG_ID,
  TEST_USER_ID,
} from '../helpers/test-app.js';

describe('Authentication Wiring', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  describe('Bearer token auth', () => {
    it('accepts valid seeded token on protected routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/captures',
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('rejects invalid token with 401 and JSON { message }', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/captures',
        headers: {
          authorization:
            'Bearer 00000000-0000-4000-8000-000000000002:wrong-secret',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toHaveProperty('message');
    });

    it('rejects missing auth with 401 and JSON { message }', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/captures',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toHaveProperty('message');
    });

    it('rejects malformed token with 401 and JSON { message }', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/captures',
        headers: { authorization: 'Bearer not-a-valid-token-format' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toHaveProperty('message');
    });
  });

  describe('Auth context propagation', () => {
    it('writes organizationId into created capture', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/captures',
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
        payload: { content: 'test capture for org context' },
      });

      expect(created.statusCode).toBe(201);
      expect(created.json().organizationId).toBe(TEST_ORG_ID);

      const fetched = await app.inject({
        method: 'GET',
        url: `/api/captures/${created.json().id}`,
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });

      expect(fetched.statusCode).toBe(200);
      expect(fetched.json().organizationId).toBe(TEST_ORG_ID);
    });

    it('writes createdById into created capture', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/captures',
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
        payload: { content: 'test capture for user context' },
      });

      expect(created.statusCode).toBe(201);
      expect(created.json().createdById).toBe(TEST_USER_ID);
    });
  });
});
