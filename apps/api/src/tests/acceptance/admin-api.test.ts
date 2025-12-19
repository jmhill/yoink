import { describe, it, expect, beforeAll } from 'vitest';
import type { HttpClient } from '../helpers/http-client.js';
import { createTestContext } from '../helpers/test-app.js';
import { loginToAdminPanel } from '../helpers/dsl.js';

// Cookie name constant - duplicated from implementation to avoid importing
const ADMIN_SESSION_COOKIE = 'admin_session';

describe('Admin API', () => {
  let client: HttpClient;
  let adminPassword: string;

  beforeAll(async () => {
    const context = await createTestContext();
    client = context.client;
    adminPassword = context.adminPassword;
  });

  describe('POST /admin/login', () => {
    it('logs in with correct password', async () => {
      const response = await client.post('/admin/login', {
        password: adminPassword,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(
        response.cookies.some((c) => c.name === ADMIN_SESSION_COOKIE)
      ).toBe(true);
    });

    it('rejects incorrect password', async () => {
      const response = await client.post('/admin/login', {
        password: 'wrong-password',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json<{ message: string }>().message).toBe(
        'Invalid password'
      );
    });
  });

  describe('GET /admin/session', () => {
    it('returns 401 without session', async () => {
      // Create a fresh client without session cookie
      const freshContext = await createTestContext();
      const response = await freshContext.client.get('/admin/session');

      expect(response.statusCode).toBe(401);
    });

    it('returns authenticated true with valid session', async () => {
      await loginToAdminPanel(client, adminPassword);

      const response = await client.get('/admin/session');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ authenticated: true });
    });
  });

  describe('POST /admin/logout', () => {
    it('clears the session cookie', async () => {
      // Login first
      await loginToAdminPanel(client, adminPassword);

      // Verify we're logged in
      const sessionCheck = await client.get('/admin/session');
      expect(sessionCheck.statusCode).toBe(200);

      // Logout
      const response = await client.post('/admin/logout', {});

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      // Check that cookie is being cleared
      const sessionCookie = response.cookies.find(
        (c) => c.name === ADMIN_SESSION_COOKIE
      );
      expect(
        sessionCookie?.value === '' ||
          (sessionCookie?.expires && sessionCookie.expires < new Date())
      ).toBe(true);
    });
  });

  describe('GET /admin/organizations', () => {
    it('returns 401 without session', async () => {
      const freshContext = await createTestContext();
      const response = await freshContext.client.get('/admin/organizations');

      expect(response.statusCode).toBe(401);
    });

    it('lists organizations with valid session', async () => {
      await loginToAdminPanel(client, adminPassword);

      const response = await client.get('/admin/organizations');

      expect(response.statusCode).toBe(200);
      const body = response.json<{ organizations: unknown[] }>();
      expect(body.organizations).toBeDefined();
      expect(Array.isArray(body.organizations)).toBe(true);
    });
  });

  describe('POST /admin/organizations', () => {
    it('creates an organization', async () => {
      const uniqueName = `test-org-create-${Date.now()}`;
      await loginToAdminPanel(client, adminPassword);

      const response = await client.post('/admin/organizations', {
        name: uniqueName,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{
        id: string;
        name: string;
        createdAt: string;
      }>();
      expect(body.name).toBe(uniqueName);
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
    });
  });

  describe('GET /admin/organizations/:id', () => {
    it('gets an organization by ID', async () => {
      const uniqueName = `test-org-get-${Date.now()}`;
      await loginToAdminPanel(client, adminPassword);

      // Create an org first
      const createResponse = await client.post('/admin/organizations', {
        name: uniqueName,
      });
      const createdOrg = createResponse.json<{ id: string; name: string }>();

      // Get it back
      const response = await client.get(
        `/admin/organizations/${createdOrg.id}`
      );

      expect(response.statusCode).toBe(200);
      expect(response.json<{ id: string }>().id).toBe(createdOrg.id);
    });

    it('returns 404 for non-existent organization', async () => {
      await loginToAdminPanel(client, adminPassword);

      const response = await client.get(
        '/admin/organizations/00000000-0000-0000-0000-000000000000'
      );

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Users CRUD', () => {
    it('creates and lists users in an organization', async () => {
      const uniqueSuffix = Date.now();
      await loginToAdminPanel(client, adminPassword);

      // Create an org
      const orgResponse = await client.post('/admin/organizations', {
        name: `test-org-users-${uniqueSuffix}`,
      });
      const org = orgResponse.json<{ id: string }>();

      // Create a user
      const createUserResponse = await client.post(
        `/admin/organizations/${org.id}/users`,
        { email: `user-${uniqueSuffix}@example.com` }
      );

      expect(createUserResponse.statusCode).toBe(201);
      const user = createUserResponse.json<{
        id: string;
        email: string;
        organizationId: string;
      }>();
      expect(user.email).toBe(`user-${uniqueSuffix}@example.com`);
      expect(user.organizationId).toBe(org.id);

      // List users
      const listResponse = await client.get(
        `/admin/organizations/${org.id}/users`
      );

      expect(listResponse.statusCode).toBe(200);
      const users = listResponse.json<{
        users: Array<{ id: string; email: string }>;
      }>();
      expect(users.users.some((u) => u.id === user.id)).toBe(true);
    });

    it('gets a user by ID', async () => {
      const uniqueSuffix = Date.now();
      await loginToAdminPanel(client, adminPassword);

      // Create an org and user
      const orgResponse = await client.post('/admin/organizations', {
        name: `test-org-get-user-${uniqueSuffix}`,
      });
      const org = orgResponse.json<{ id: string }>();

      const createUserResponse = await client.post(
        `/admin/organizations/${org.id}/users`,
        { email: `getuser-${uniqueSuffix}@example.com` }
      );
      const user = createUserResponse.json<{ id: string; email: string }>();

      // Get user
      const response = await client.get(`/admin/users/${user.id}`);

      expect(response.statusCode).toBe(200);
      expect(response.json<{ id: string }>().id).toBe(user.id);
    });
  });

  describe('Tokens CRUD', () => {
    it('creates, lists, and revokes tokens for a user', async () => {
      const uniqueSuffix = Date.now();
      await loginToAdminPanel(client, adminPassword);

      // Create an org and user
      const orgResponse = await client.post('/admin/organizations', {
        name: `test-org-tokens-${uniqueSuffix}`,
      });
      const org = orgResponse.json<{ id: string }>();

      const userResponse = await client.post(
        `/admin/organizations/${org.id}/users`,
        { email: `tokens-${uniqueSuffix}@example.com` }
      );
      const user = userResponse.json<{ id: string }>();

      // Create a token
      const createTokenResponse = await client.post(
        `/admin/users/${user.id}/tokens`,
        { name: 'my-device' }
      );

      expect(createTokenResponse.statusCode).toBe(201);
      const tokenResult = createTokenResponse.json<{
        token: { id: string; name: string };
        rawToken: string;
      }>();
      expect(tokenResult.token.name).toBe('my-device');
      expect(tokenResult.rawToken).toContain(':');
      expect(tokenResult.rawToken.startsWith(tokenResult.token.id)).toBe(true);

      // List tokens
      const listResponse = await client.get(`/admin/users/${user.id}/tokens`);

      expect(listResponse.statusCode).toBe(200);
      const tokens = listResponse.json<{
        tokens: Array<{ id: string }>;
      }>();
      expect(tokens.tokens.some((t) => t.id === tokenResult.token.id)).toBe(
        true
      );

      // Revoke the token
      const revokeResponse = await client.delete(
        `/admin/tokens/${tokenResult.token.id}`
      );

      expect(revokeResponse.statusCode).toBe(204);

      // Verify token is gone
      const listAfterRevokeResponse = await client.get(
        `/admin/users/${user.id}/tokens`
      );

      const tokensAfterRevoke = listAfterRevokeResponse.json<{
        tokens: Array<{ id: string }>;
      }>();
      expect(
        tokensAfterRevoke.tokens.some((t) => t.id === tokenResult.token.id)
      ).toBe(false);
    });
  });

  describe('Full workflow: create org, user, token, then use token', () => {
    it('creates API token that can be used for capture API', async () => {
      const uniqueSuffix = Date.now();
      await loginToAdminPanel(client, adminPassword);

      // Create org
      const orgResponse = await client.post('/admin/organizations', {
        name: `workflow-org-${uniqueSuffix}`,
      });
      const org = orgResponse.json<{ id: string }>();

      // Create user
      const userResponse = await client.post(
        `/admin/organizations/${org.id}/users`,
        { email: `workflow-${uniqueSuffix}@example.com` }
      );
      const user = userResponse.json<{ id: string }>();

      // Create token
      const tokenResponse = await client.post(
        `/admin/users/${user.id}/tokens`,
        { name: 'my-laptop' }
      );
      const { rawToken } = tokenResponse.json<{ rawToken: string }>();

      // Use the token to create a capture
      const uniqueContent = `workflow-capture-${uniqueSuffix}`;
      const captureResponse = await client.post(
        '/captures',
        { content: uniqueContent },
        { authorization: `Bearer ${rawToken}` }
      );

      expect(captureResponse.statusCode).toBe(201);
      const capture = captureResponse.json<{
        content: string;
        organizationId: string;
        createdById: string;
      }>();
      expect(capture.content).toBe(uniqueContent);
      expect(capture.organizationId).toBe(org.id);
      expect(capture.createdById).toBe(user.id);
    });
  });
});
