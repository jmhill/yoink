import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { registerTokenRoutes } from './token-routes.js';
import { createUserTokenService } from '../domain/user-token-service.js';
import { createSessionService } from '../domain/session-service.js';
import { createUserService } from '../../users/domain/user-service.js';
import { createMembershipService } from '../../organizations/domain/membership-service.js';
import { createFakeUserStore } from '../../users/infrastructure/fake-user-store.js';
import { createFakeOrganizationStore } from '../../organizations/infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../../organizations/infrastructure/fake-organization-membership-store.js';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import { createFakeUserSessionStore } from '../infrastructure/fake-user-session-store.js';
import type { User } from '../../users/domain/user.js';
import type { Organization } from '../../organizations/domain/organization.js';
import type { OrganizationMembership } from '../../organizations/domain/organization-membership.js';
import type { UserSession } from '../domain/user-session.js';
import type { TokenStore } from '../domain/token-store.js';
import {
  createFakeClock,
  createFakeIdGenerator,
} from '@yoink/infrastructure';

const USER_SESSION_COOKIE = 'user_session';

describe('token routes', () => {
  let app: FastifyInstance;
  let clock: ReturnType<typeof createFakeClock>;
  let tokenStore: TokenStore;

  const testOrg: Organization = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Test Org',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const testUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    email: 'test@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const testMembership: OrganizationMembership = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    userId: testUser.id,
    organizationId: testOrg.id,
    role: 'admin',
    isPersonalOrg: true,
    joinedAt: '2024-01-01T00:00:00.000Z',
  };

  const testSession: UserSession = {
    id: '550e8400-e29b-41d4-a716-446655440004',
    userId: testUser.id,
    currentOrganizationId: testOrg.id,
    createdAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2024-12-31T00:00:00.000Z',
    lastActiveAt: '2024-06-15T12:00:00.000Z',
  };

  const passwordHasher = {
    hash: async (password: string) => `hashed:${password}`,
    compare: async (password: string, hash: string) => hash === `hashed:${password}`,
  };

  beforeEach(async () => {
    clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const idGenerator = createFakeIdGenerator();

    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [testOrg],
    });
    const userStore = createFakeUserStore({
      initialUsers: [testUser],
    });
    const membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [testMembership],
    });
    tokenStore = createFakeTokenStore();
    const sessionStore = createFakeUserSessionStore({
      initialSessions: [testSession],
    });

    const userService = createUserService({ userStore });
    const membershipService = createMembershipService({
      membershipStore,
      userService,
      organizationStore,
      clock,
      idGenerator,
    });

    const sessionService = createSessionService({
      sessionStore,
      userService,
      membershipService,
      clock,
      idGenerator,
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
      refreshThresholdMs: 24 * 60 * 60 * 1000,
    });

    const userTokenService = createUserTokenService({
      tokenStore,
      clock,
      idGenerator,
      passwordHasher,
      maxTokensPerUserPerOrg: 2,
    });

    app = Fastify();
    await app.register(cookie);

    await registerTokenRoutes(app, {
      userTokenService,
      sessionService,
      sessionCookieName: USER_SESSION_COOKIE,
    });

    await app.ready();
  });

  const makeAuthenticatedRequest = async (method: string, url: string, body?: object) => {
    return app.inject({
      method: method as 'GET' | 'POST' | 'DELETE',
      url,
      cookies: {
        [USER_SESSION_COOKIE]: testSession.id,
      },
      payload: body,
    });
  };

  describe('GET /api/auth/tokens', () => {
    it('returns empty array when user has no tokens', async () => {
      const response = await makeAuthenticatedRequest('GET', '/api/auth/tokens');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ tokens: [] });
    });

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/tokens',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/tokens', () => {
    it('creates a new token and returns the raw value', async () => {
      const response = await makeAuthenticatedRequest('POST', '/api/auth/tokens', {
        name: 'My Extension Token',
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.token.name).toBe('My Extension Token');
      expect(body.rawToken).toMatch(/^[^:]+:[^:]+$/);
    });

    it('returns 409 when token limit is reached', async () => {
      // Create 2 tokens (the limit)
      await makeAuthenticatedRequest('POST', '/api/auth/tokens', { name: 'Token 1' });
      await makeAuthenticatedRequest('POST', '/api/auth/tokens', { name: 'Token 2' });

      // Try to create a third
      const response = await makeAuthenticatedRequest('POST', '/api/auth/tokens', {
        name: 'Token 3',
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().message).toContain('at most 2');
    });

    it('returns 400 when name is missing', async () => {
      const response = await makeAuthenticatedRequest('POST', '/api/auth/tokens', {});

      expect(response.statusCode).toBe(400);
    });

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/tokens',
        payload: { name: 'Test Token' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/auth/tokens/:tokenId', () => {
    it('deletes a token owned by the user', async () => {
      // Create a token first
      const createResponse = await makeAuthenticatedRequest('POST', '/api/auth/tokens', {
        name: 'Token to delete',
      });
      const { token } = createResponse.json();

      // Delete it
      const response = await makeAuthenticatedRequest('DELETE', `/api/auth/tokens/${token.id}`);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      // Verify it's gone
      const listResponse = await makeAuthenticatedRequest('GET', '/api/auth/tokens');
      expect(listResponse.json().tokens).toEqual([]);
    });

    it('returns 404 when token does not exist', async () => {
      const response = await makeAuthenticatedRequest(
        'DELETE',
        '/api/auth/tokens/non-existent-id'
      );

      expect(response.statusCode).toBe(404);
    });

    it('returns 403 when trying to delete another user token', async () => {
      // Save a token for a different user
      await tokenStore.save({
        id: 'other-token',
        userId: 'other-user-id',
        organizationId: testOrg.id,
        tokenHash: 'hash',
        name: 'Other Token',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const response = await makeAuthenticatedRequest('DELETE', '/api/auth/tokens/other-token');

      expect(response.statusCode).toBe(403);
    });

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/auth/tokens/some-id',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
