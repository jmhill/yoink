import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { createCombinedAuthMiddleware, USER_SESSION_COOKIE } from './combined-auth-middleware.js';
import { createTokenService } from '../domain/token-service.js';
import { createSessionService } from '../domain/session-service.js';
import type { Organization } from '../../organizations/domain/organization.js';
import { createFakeOrganizationStore } from '../../organizations/infrastructure/fake-organization-store.js';
import type { User } from '../../users/domain/user.js';
import { createFakeUserStore } from '../../users/infrastructure/fake-user-store.js';
import type { ApiToken } from '../domain/api-token.js';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import { createFakeUserSessionStore } from '../infrastructure/fake-user-session-store.js';
import { createFakeOrganizationMembershipStore } from '../../organizations/infrastructure/fake-organization-membership-store.js';
import { createUserService } from '../../users/domain/user-service.js';
import { createMembershipService } from '../../organizations/domain/membership-service.js';
import type { OrganizationMembership } from '../../organizations/domain/organization-membership.js';
import type { UserSession } from '../domain/user-session.js';
import {
  createFakePasswordHasher,
  createFakeClock,
  createFakeIdGenerator,
} from '@yoink/infrastructure';

describe('combinedAuthMiddleware', () => {
  let app: FastifyInstance;
  let clock: ReturnType<typeof createFakeClock>;
  let sessionStore: ReturnType<typeof createFakeUserSessionStore>;

  const testOrg: Organization = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Test Org',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const testUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    organizationId: testOrg.id,
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

  const testToken: ApiToken = {
    id: '550e8400-e29b-41d4-a716-446655440003',
    userId: testUser.id,
    tokenHash: 'fake-hash:valid-token',
    name: 'test-token',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const testSession: UserSession = {
    id: '550e8400-e29b-41d4-a716-446655440004',
    userId: testUser.id,
    currentOrganizationId: testOrg.id,
    createdAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2024-12-31T00:00:00.000Z', // Far future
    lastActiveAt: '2024-06-15T12:00:00.000Z',
  };

  beforeEach(async () => {
    clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));

    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [testOrg],
    });

    const userStore = createFakeUserStore({
      initialUsers: [testUser],
    });

    const tokenStore = createFakeTokenStore({
      initialTokens: [testToken],
    });

    sessionStore = createFakeUserSessionStore({
      initialSessions: [testSession],
    });

    const membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [testMembership],
    });

    const tokenService = createTokenService({
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      clock,
    });

    const userService = createUserService({ userStore });

    const membershipService = createMembershipService({
      membershipStore,
      userService,
      organizationStore,
      clock,
      idGenerator: createFakeIdGenerator(),
    });

    const sessionService = createSessionService({
      sessionStore,
      userService,
      membershipService,
      clock,
      idGenerator: createFakeIdGenerator(),
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
      refreshThresholdMs: 24 * 60 * 60 * 1000,
    });

    const combinedAuthMiddleware = createCombinedAuthMiddleware({
      tokenService,
      sessionService,
      sessionCookieName: USER_SESSION_COOKIE,
    });

    app = Fastify();
    await app.register(cookie);
    app.addHook('preHandler', combinedAuthMiddleware);

    app.get('/test', async (request) => {
      return {
        authContext: request.authContext,
        hasSession: !!request.userSession,
      };
    });

    await app.ready();
  });

  describe('session cookie authentication', () => {
    it('authenticates with valid session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().authContext).toEqual({
        organizationId: testOrg.id,
        userId: testUser.id,
      });
      expect(response.json().hasSession).toBe(true);
    });

    it('returns 401 for expired session', async () => {
      const expiredSession: UserSession = {
        ...testSession,
        id: 'expired-session-id',
        expiresAt: '2024-01-01T00:00:00.000Z', // In the past
      };
      await sessionStore.save(expiredSession);

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        cookies: { [USER_SESSION_COOKIE]: expiredSession.id },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid or expired session');
    });

    it('returns 401 for non-existent session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        cookies: { [USER_SESSION_COOKIE]: 'non-existent-session-id' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid or expired session');
    });
  });

  describe('bearer token authentication', () => {
    it('authenticates with valid Bearer token', async () => {
      const validToken = `${testToken.id}:valid-token`;
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().authContext).toEqual({
        organizationId: testOrg.id,
        userId: testUser.id,
      });
      expect(response.json().hasSession).toBe(false);
    });

    it('returns 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer invalid-token' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid token');
    });
  });

  describe('authentication precedence', () => {
    it('prefers session cookie over Bearer token when both present', async () => {
      // Create a different org for the token auth to distinguish
      const validToken = `${testToken.id}:valid-token`;

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: `Bearer ${validToken}` },
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(200);
      // Should use session (hasSession = true means session was used)
      expect(response.json().hasSession).toBe(true);
    });

    it('falls back to token when session is invalid', async () => {
      const validToken = `${testToken.id}:valid-token`;

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: `Bearer ${validToken}` },
        cookies: { [USER_SESSION_COOKIE]: 'invalid-session-id' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().hasSession).toBe(false);
    });
  });

  describe('no authentication', () => {
    it('returns 401 when neither session nor token is present', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Not authenticated');
    });
  });
});
