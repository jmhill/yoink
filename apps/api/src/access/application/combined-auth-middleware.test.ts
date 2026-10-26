import { Writable } from 'node:stream';
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { createCombinedAuthMiddleware, USER_SESSION_COOKIE } from './combined-auth-middleware.js';
import { AUTH_TRY_AGAIN_MESSAGE } from './token-validation-response.js';
import { createTokenService } from '../domain/token-service.js';
import { createSessionService } from '../domain/session-service.js';
import type { Organization } from '../domain/organization.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import type { User } from '../domain/user.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import type { ApiToken } from '../domain/api-token.js';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import { createFakeUserSessionStore } from '../infrastructure/fake-user-session-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createUserService } from '../domain/user-service.js';
import { createMembershipService } from '../domain/membership-service.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
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
    organizationId: testOrg.id,
    tokenHash: 'fake-hash:valid-token',
    name: 'test-token',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const agentUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440005',
    email: 'agent-550e8400-e29b-41d4-a716-446655440005@yoink.invalid',
    name: 'Lane',
    kind: 'agent',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const agentToken: ApiToken = {
    id: '550e8400-e29b-41d4-a716-446655440006',
    userId: agentUser.id,
    organizationId: testOrg.id,
    tokenHash: 'fake-hash:agent-token',
    name: 'Lane',
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
      initialUsers: [testUser, agentUser],
    });

    const tokenStore = createFakeTokenStore({
      initialTokens: [testToken, agentToken],
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
        principalKind: 'human',
        actor: { kind: 'user', userId: testUser.id, via: 'session' as const },
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
    it('authenticates a person token as a user actor', async () => {
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
        principalKind: 'human',
        actor: { kind: 'user', userId: testUser.id, via: 'token' as const },
      });
      expect(response.json().hasSession).toBe(false);
    });

    it('authenticates an agent token as a bot actor', async () => {
      const validToken = `${agentToken.id}:agent-token`;
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().authContext).toEqual({
        organizationId: testOrg.id,
        userId: agentUser.id,
        principalKind: 'agent',
        actor: {
          kind: 'bot',
          tokenId: agentToken.id,
          userId: agentUser.id,
          name: 'Lane',
          via: 'token' as const,
        },
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

describe('combined token check responses', () => {
  const tokenId = '550e8400-e29b-41d4-a716-446655440003';
  const secret = 'lane-bot-secret-9f3a';

  const start = async (failFind = false) => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const organization: Organization = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Org',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const user: User = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      email: 'lane@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const token: ApiToken = {
      id: tokenId,
      userId: user.id,
      organizationId: organization.id,
      tokenHash: `fake-hash:${secret}`,
      name: 'Lane',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const app = Fastify({ logger: { level: 'info', stream } });
    await app.register(cookie);
    app.addHook(
      'preHandler',
      createCombinedAuthMiddleware({
        tokenService: createTokenService({
          organizationStore: createFakeOrganizationStore({ initialOrganizations: [organization] }),
          userStore: createFakeUserStore({ initialUsers: [user] }),
          tokenStore: createFakeTokenStore({
            shouldFailOnFind: failFind,
            initialTokens: [token],
          }),
          passwordHasher: createFakePasswordHasher(),
          clock,
        }),
        sessionService: createSessionService({
          sessionStore: createFakeUserSessionStore(),
          userService: createUserService({
            userStore: createFakeUserStore({ initialUsers: [user] }),
          }),
          membershipService: createMembershipService({
            membershipStore: createFakeOrganizationMembershipStore(),
            userService: createUserService({
              userStore: createFakeUserStore({ initialUsers: [user] }),
            }),
            organizationStore: createFakeOrganizationStore({ initialOrganizations: [organization] }),
            clock,
            idGenerator: createFakeIdGenerator(),
          }),
          clock,
          idGenerator: createFakeIdGenerator(),
          sessionTtlMs: 1000,
          refreshThresholdMs: 1000,
        }),
        sessionCookieName: USER_SESSION_COOKIE,
      })
    );
    app.get('/test', async () => ({ ok: true }));
    await app.ready();
    return { app, lines };
  };

  it('accepts a valid bearer token and does not call it invalid', async () => {
    const { app, lines } = await start();
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${tokenId}:${secret}` },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain('Invalid token');
    expect(lines.join('')).not.toContain(secret);
    await app.close();
  });

  it('asks the caller to try again when the database fails, even if a session cookie was also sent', async () => {
    const { app, lines } = await start(true);
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${tokenId}:${secret}` },
      cookies: { [USER_SESSION_COOKIE]: 'not-a-session' },
    });

    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ message: AUTH_TRY_AGAIN_MESSAGE });
    expect(lines.join('')).not.toContain(secret);
    expect(lines.join('')).not.toContain('Invalid token');
    await app.close();
  });

  it('still tells a truly bad token that it is invalid', async () => {
    const { app } = await start();
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer not-a-valid-token-zzzz' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: 'Invalid token' });
    await app.close();
  });
});
