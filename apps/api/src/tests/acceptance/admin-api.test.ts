import { describe, it, expect, beforeEach } from 'vitest';
import { createTestAppWithAdmin, TEST_ADMIN_PASSWORD } from '../helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import { ADMIN_SESSION_COOKIE } from '../../admin/application/admin-session-middleware.js';

describe('Admin API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestAppWithAdmin();
  });

  const login = async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: { password: TEST_ADMIN_PASSWORD },
    });
    const cookies = response.cookies as Array<{ name: string; value: string }>;
    const sessionCookie = cookies.find((c) => c.name === ADMIN_SESSION_COOKIE);
    return sessionCookie?.value;
  };

  describe('POST /admin/login', () => {
    it('logs in with correct password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/login',
        payload: { password: TEST_ADMIN_PASSWORD },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      const cookies = response.cookies as Array<{ name: string; value: string }>;
      expect(cookies.some((c) => c.name === ADMIN_SESSION_COOKIE)).toBe(true);
    });

    it('rejects incorrect password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/login',
        payload: { password: 'wrong-password' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid password');
    });
  });

  describe('POST /admin/logout', () => {
    it('clears the session cookie', async () => {
      // First login
      const sessionToken = await login();
      expect(sessionToken).toBeDefined();

      // Then logout
      const response = await app.inject({
        method: 'POST',
        url: '/admin/logout',
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      // Check that cookie is being cleared
      const cookies = response.cookies as Array<{ name: string; value: string; expires?: Date }>;
      const sessionCookie = cookies.find((c) => c.name === ADMIN_SESSION_COOKIE);
      // The cookie should be cleared (empty value or past expiry)
      expect(sessionCookie?.value === '' || (sessionCookie?.expires && new Date(sessionCookie.expires) < new Date())).toBe(true);
    });
  });

  describe('GET /admin/organizations', () => {
    it('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/organizations',
      });

      expect(response.statusCode).toBe(401);
    });

    it('lists organizations with valid session', async () => {
      const sessionToken = await login();

      const response = await app.inject({
        method: 'GET',
        url: '/admin/organizations',
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().organizations).toBeDefined();
      expect(Array.isArray(response.json().organizations)).toBe(true);
    });
  });

  describe('POST /admin/organizations', () => {
    it('creates an organization', async () => {
      const sessionToken = await login();

      const response = await app.inject({
        method: 'POST',
        url: '/admin/organizations',
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { name: 'New Organization' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.name).toBe('New Organization');
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
    });
  });

  describe('GET /admin/organizations/:id', () => {
    it('gets an organization by ID', async () => {
      const sessionToken = await login();

      // Create an org first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/admin/organizations',
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { name: 'Test Org' },
      });
      const createdOrg = createResponse.json();

      // Get it back
      const response = await app.inject({
        method: 'GET',
        url: `/admin/organizations/${createdOrg.id}`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(createdOrg);
    });

    it('returns 404 for non-existent organization', async () => {
      const sessionToken = await login();

      const response = await app.inject({
        method: 'GET',
        url: '/admin/organizations/00000000-0000-0000-0000-000000000000',
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Users CRUD', () => {
    it('creates and lists users in an organization', async () => {
      const sessionToken = await login();

      // Create an org
      const orgResponse = await app.inject({
        method: 'POST',
        url: '/admin/organizations',
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { name: 'Test Org' },
      });
      const org = orgResponse.json();

      // Create a user
      const createUserResponse = await app.inject({
        method: 'POST',
        url: `/admin/organizations/${org.id}/users`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { email: 'user@example.com' },
      });

      expect(createUserResponse.statusCode).toBe(201);
      const user = createUserResponse.json();
      expect(user.email).toBe('user@example.com');
      expect(user.organizationId).toBe(org.id);

      // List users
      const listResponse = await app.inject({
        method: 'GET',
        url: `/admin/organizations/${org.id}/users`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().users).toContainEqual(user);
    });

    it('gets a user by ID', async () => {
      const sessionToken = await login();

      // Create an org and user
      const orgResponse = await app.inject({
        method: 'POST',
        url: '/admin/organizations',
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { name: 'Test Org' },
      });
      const org = orgResponse.json();

      const createUserResponse = await app.inject({
        method: 'POST',
        url: `/admin/organizations/${org.id}/users`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { email: 'user@example.com' },
      });
      const user = createUserResponse.json();

      // Get user
      const response = await app.inject({
        method: 'GET',
        url: `/admin/users/${user.id}`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(user);
    });
  });

  describe('Tokens CRUD', () => {
    it('creates, lists, and revokes tokens for a user', async () => {
      const sessionToken = await login();

      // Create an org and user
      const orgResponse = await app.inject({
        method: 'POST',
        url: '/admin/organizations',
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { name: 'Test Org' },
      });
      const org = orgResponse.json();

      const userResponse = await app.inject({
        method: 'POST',
        url: `/admin/organizations/${org.id}/users`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { email: 'user@example.com' },
      });
      const user = userResponse.json();

      // Create a token
      const createTokenResponse = await app.inject({
        method: 'POST',
        url: `/admin/users/${user.id}/tokens`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { name: 'my-device' },
      });

      expect(createTokenResponse.statusCode).toBe(201);
      const tokenResult = createTokenResponse.json();
      expect(tokenResult.token.name).toBe('my-device');
      expect(tokenResult.rawToken).toContain(':');
      expect(tokenResult.rawToken.startsWith(tokenResult.token.id)).toBe(true);

      // List tokens
      const listResponse = await app.inject({
        method: 'GET',
        url: `/admin/users/${user.id}/tokens`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().tokens).toHaveLength(1);

      // Revoke the token
      const revokeResponse = await app.inject({
        method: 'DELETE',
        url: `/admin/tokens/${tokenResult.token.id}`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
      });

      expect(revokeResponse.statusCode).toBe(204);

      // Verify token is gone
      const listAfterRevokeResponse = await app.inject({
        method: 'GET',
        url: `/admin/users/${user.id}/tokens`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
      });

      expect(listAfterRevokeResponse.json().tokens).toHaveLength(0);
    });
  });

  describe('Full workflow: create org, user, token, then use token', () => {
    it('creates API token that can be used for capture API', async () => {
      const sessionToken = await login();

      // Create org
      const orgResponse = await app.inject({
        method: 'POST',
        url: '/admin/organizations',
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { name: 'My Captures' },
      });
      const org = orgResponse.json();

      // Create user
      const userResponse = await app.inject({
        method: 'POST',
        url: `/admin/organizations/${org.id}/users`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { email: 'me@example.com' },
      });
      const user = userResponse.json();

      // Create token
      const tokenResponse = await app.inject({
        method: 'POST',
        url: `/admin/users/${user.id}/tokens`,
        cookies: { [ADMIN_SESSION_COOKIE]: sessionToken! },
        payload: { name: 'my-laptop' },
      });
      const { rawToken } = tokenResponse.json();

      // Use the token to create a capture
      const captureResponse = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: { authorization: `Bearer ${rawToken}` },
        payload: { content: 'My first capture!' },
      });

      expect(captureResponse.statusCode).toBe(201);
      const capture = captureResponse.json();
      expect(capture.content).toBe('My first capture!');
      expect(capture.organizationId).toBe(org.id);
      expect(capture.createdById).toBe(user.id);
    });
  });
});
