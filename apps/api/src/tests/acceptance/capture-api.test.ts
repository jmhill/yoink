import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, TEST_TOKEN } from '../helpers/test-app.js';
import type { FastifyInstance } from 'fastify';

describe('Capture API', () => {
  const VALID_TOKEN = TEST_TOKEN;
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  describe('POST /captures', () => {
    it('creates a capture with valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'My captured text' },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.content).toBe('My captured text');
      expect(body.status).toBe('inbox');
      expect(body.id).toBeDefined();
      expect(body.organizationId).toBeDefined();
      expect(body.createdById).toBeDefined();
      expect(body.capturedAt).toBeDefined();
    });

    it('creates a capture with optional fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: {
          content: 'My captured text',
          title: 'A title',
          sourceUrl: 'https://example.com/article',
          sourceApp: 'browser-extension',
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.title).toBe('A title');
      expect(body.sourceUrl).toBe('https://example.com/article');
      expect(body.sourceApp).toBe('browser-extension');
    });

    it('rejects request without token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/captures',
        payload: { content: 'My captured text' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects request with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: 'Bearer wrong-token' },
        payload: { content: 'My captured text' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects invalid content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: '' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /captures', () => {
    it('lists captures for authenticated user', async () => {
      await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'First capture' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.captures).toHaveLength(1);
      expect(body.captures[0].content).toBe('First capture');
    });

    it('returns captures in newest-first order', async () => {
      await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'First' },
      });

      await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'Second' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      const body = response.json();
      expect(body.captures[0].content).toBe('Second');
      expect(body.captures[1].content).toBe('First');
    });

    it('rejects request without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/captures',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('end-to-end flow', () => {
    it('creates and retrieves a capture', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'My captured text' },
      });

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json().content).toBe('My captured text');

      const listResponse = await app.inject({
        method: 'GET',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(listResponse.json().captures).toHaveLength(1);
    });
  });
});
