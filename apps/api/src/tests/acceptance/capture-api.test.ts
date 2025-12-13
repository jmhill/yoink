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

  describe('GET /captures/:id', () => {
    it('returns capture by id', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'My captured text' },
      });

      const created = createResponse.json();

      const response = await app.inject({
        method: 'GET',
        url: `/captures/${created.id}`,
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(created);
    });

    it('returns 404 for non-existent capture', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/captures/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects request without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/captures/00000000-0000-0000-0000-000000000000',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for invalid id format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/captures/not-a-uuid',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PATCH /captures/:id', () => {
    it('updates capture content', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'Original content' },
      });

      const created = createResponse.json();

      const response = await app.inject({
        method: 'PATCH',
        url: `/captures/${created.id}`,
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'Updated content' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().content).toBe('Updated content');
    });

    it('updates capture title', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'Some content' },
      });

      const created = createResponse.json();

      const response = await app.inject({
        method: 'PATCH',
        url: `/captures/${created.id}`,
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { title: 'New title' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().title).toBe('New title');
    });

    it('archives capture and sets archivedAt', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'Content to archive' },
      });

      const created = createResponse.json();

      const response = await app.inject({
        method: 'PATCH',
        url: `/captures/${created.id}`,
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { status: 'archived' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('archived');
      expect(response.json().archivedAt).toBeDefined();
    });

    it('un-archives capture and clears archivedAt', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'Content' },
      });

      const created = createResponse.json();

      await app.inject({
        method: 'PATCH',
        url: `/captures/${created.id}`,
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { status: 'archived' },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/captures/${created.id}`,
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { status: 'inbox' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('inbox');
      expect(response.json().archivedAt).toBeUndefined();
    });

    it('returns 404 for non-existent capture', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/captures/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects request without token', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/captures/00000000-0000-0000-0000-000000000000',
        payload: { content: 'Updated' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for invalid id format', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/captures/not-a-uuid',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        payload: { content: 'Updated' },
      });

      expect(response.statusCode).toBe(400);
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
