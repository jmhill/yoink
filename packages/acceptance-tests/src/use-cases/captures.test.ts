import { describe, it, expect, beforeAll } from 'vitest';
import { createHttpClient, type HttpClient } from '../drivers/index.js';
import { getTestConfig } from '../config.js';
import {
  loginToAdminPanel,
  logoutAdmin,
  createTestTenant,
  type TestTenant,
} from '../dsl/index.js';

describe('Captures', () => {
  let client: HttpClient;
  let tenant: TestTenant;

  beforeAll(async () => {
    const config = getTestConfig();
    client = createHttpClient(config.baseUrl);

    // Create isolated tenant for this test suite
    await loginToAdminPanel(client, config.adminPassword);
    tenant = await createTestTenant(client);
    await logoutAdmin(client);
  });

  describe('POST /captures', () => {
    it('creates a capture with valid token', async () => {
      const uniqueContent = `capture-create-${Date.now()}`;

      const response = await client.post(
        '/captures',
        { content: uniqueContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(response.statusCode).toBe(201);

      const body = response.json<{
        id: string;
        content: string;
        status: string;
        organizationId: string;
        createdById: string;
        capturedAt: string;
      }>();
      expect(body.content).toBe(uniqueContent);
      expect(body.status).toBe('inbox');
      expect(body.id).toBeDefined();
      expect(body.organizationId).toBe(tenant.organization.id);
      expect(body.createdById).toBe(tenant.user.id);
      expect(body.capturedAt).toBeDefined();
    });

    it('creates a capture with optional fields', async () => {
      const uniqueContent = `capture-optional-${Date.now()}`;

      const response = await client.post(
        '/captures',
        {
          content: uniqueContent,
          title: 'A title',
          sourceUrl: 'https://example.com/article',
          sourceApp: 'browser-extension',
        },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(response.statusCode).toBe(201);

      const body = response.json<{
        title: string;
        sourceUrl: string;
        sourceApp: string;
      }>();
      expect(body.title).toBe('A title');
      expect(body.sourceUrl).toBe('https://example.com/article');
      expect(body.sourceApp).toBe('browser-extension');
    });

    it('rejects request without token', async () => {
      const response = await client.post('/captures', {
        content: 'My captured text',
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects request with invalid token', async () => {
      const response = await client.post(
        '/captures',
        { content: 'My captured text' },
        { authorization: 'Bearer wrong-token' }
      );

      expect(response.statusCode).toBe(401);
    });

    it('rejects invalid content', async () => {
      const response = await client.post(
        '/captures',
        { content: '' },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /captures', () => {
    it('lists captures for authenticated user', async () => {
      const uniqueContent = `capture-list-${Date.now()}`;

      await client.post(
        '/captures',
        { content: uniqueContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      const response = await client.get('/captures', {
        authorization: `Bearer ${tenant.apiToken}`,
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        captures: Array<{ content: string }>;
      }>();
      expect(body.captures.length).toBeGreaterThanOrEqual(1);
      expect(body.captures.some((c) => c.content === uniqueContent)).toBe(true);
    });

    it('returns captures in newest-first order', async () => {
      const firstContent = `capture-order-first-${Date.now()}`;
      const secondContent = `capture-order-second-${Date.now()}`;

      await client.post(
        '/captures',
        { content: firstContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      await client.post(
        '/captures',
        { content: secondContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      const response = await client.get('/captures', {
        authorization: `Bearer ${tenant.apiToken}`,
      });

      const body = response.json<{
        captures: Array<{ content: string }>;
      }>();

      // Find positions of our test captures
      const firstIndex = body.captures.findIndex(
        (c) => c.content === firstContent
      );
      const secondIndex = body.captures.findIndex(
        (c) => c.content === secondContent
      );

      // Second (newer) should come before first (older)
      expect(secondIndex).toBeLessThan(firstIndex);
    });

    it('rejects request without token', async () => {
      const response = await client.get('/captures');

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /captures/:id', () => {
    it('returns capture by id', async () => {
      const uniqueContent = `capture-get-by-id-${Date.now()}`;

      const createResponse = await client.post(
        '/captures',
        { content: uniqueContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      const created = createResponse.json<{ id: string }>();

      const response = await client.get(`/captures/${created.id}`, {
        authorization: `Bearer ${tenant.apiToken}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ content: string }>().content).toBe(uniqueContent);
    });

    it('returns 404 for non-existent capture', async () => {
      const response = await client.get(
        '/captures/00000000-0000-0000-0000-000000000000',
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(response.statusCode).toBe(404);
    });

    it('rejects request without token', async () => {
      const response = await client.get(
        '/captures/00000000-0000-0000-0000-000000000000'
      );

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for invalid id format', async () => {
      const response = await client.get('/captures/not-a-uuid', {
        authorization: `Bearer ${tenant.apiToken}`,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PATCH /captures/:id', () => {
    it('updates capture content', async () => {
      const originalContent = `capture-update-original-${Date.now()}`;
      const updatedContent = `capture-update-updated-${Date.now()}`;

      const createResponse = await client.post(
        '/captures',
        { content: originalContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      const created = createResponse.json<{ id: string }>();

      const response = await client.patch(
        `/captures/${created.id}`,
        { content: updatedContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(response.statusCode).toBe(200);
      expect(response.json<{ content: string }>().content).toBe(updatedContent);
    });

    it('updates capture title', async () => {
      const uniqueContent = `capture-update-title-${Date.now()}`;

      const createResponse = await client.post(
        '/captures',
        { content: uniqueContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      const created = createResponse.json<{ id: string }>();

      const response = await client.patch(
        `/captures/${created.id}`,
        { title: 'New title' },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(response.statusCode).toBe(200);
      expect(response.json<{ title: string }>().title).toBe('New title');
    });

    it('archives capture and sets archivedAt', async () => {
      const uniqueContent = `capture-archive-${Date.now()}`;

      const createResponse = await client.post(
        '/captures',
        { content: uniqueContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      const created = createResponse.json<{ id: string }>();

      const response = await client.patch(
        `/captures/${created.id}`,
        { status: 'archived' },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(response.statusCode).toBe(200);
      const body = response.json<{ status: string; archivedAt: string }>();
      expect(body.status).toBe('archived');
      expect(body.archivedAt).toBeDefined();
    });

    it('un-archives capture and clears archivedAt', async () => {
      const uniqueContent = `capture-unarchive-${Date.now()}`;

      const createResponse = await client.post(
        '/captures',
        { content: uniqueContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      const created = createResponse.json<{ id: string }>();

      // First archive
      await client.patch(
        `/captures/${created.id}`,
        { status: 'archived' },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      // Then un-archive
      const response = await client.patch(
        `/captures/${created.id}`,
        { status: 'inbox' },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(response.statusCode).toBe(200);
      const body = response.json<{ status: string; archivedAt?: string }>();
      expect(body.status).toBe('inbox');
      expect(body.archivedAt).toBeUndefined();
    });

    it('returns 404 for non-existent capture', async () => {
      const response = await client.patch(
        '/captures/00000000-0000-0000-0000-000000000000',
        { content: 'Updated' },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(response.statusCode).toBe(404);
    });

    it('rejects request without token', async () => {
      const response = await client.patch(
        '/captures/00000000-0000-0000-0000-000000000000',
        { content: 'Updated' }
      );

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for invalid id format', async () => {
      const response = await client.patch(
        '/captures/not-a-uuid',
        { content: 'Updated' },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(response.statusCode).toBe(400);
    });
  });

  describe('end-to-end flow', () => {
    it('creates and retrieves a capture', async () => {
      const uniqueContent = `capture-e2e-flow-${Date.now()}`;

      const createResponse = await client.post(
        '/captures',
        { content: uniqueContent },
        { authorization: `Bearer ${tenant.apiToken}` }
      );

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json<{ content: string }>().content).toBe(
        uniqueContent
      );

      const listResponse = await client.get('/captures', {
        authorization: `Bearer ${tenant.apiToken}`,
      });

      const body = listResponse.json<{
        captures: Array<{ content: string }>;
      }>();
      expect(body.captures.some((c) => c.content === uniqueContent)).toBe(true);
    });
  });
});
