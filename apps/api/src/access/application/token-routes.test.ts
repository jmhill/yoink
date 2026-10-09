import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { ResultAsync } from 'neverthrow';
import { registerTokenRoutes } from './token-routes.js';
import { createTokenHandlers } from './create-token-handlers.js';
import { createStoreBackedTokenPersist } from '../infrastructure/store-backed-token-persist.js';
import { createSessionService } from '../domain/session-service.js';
import { createTokenService } from '../domain/token-service.js';
import { createUserService } from '../domain/user-service.js';
import { createMembershipService } from '../domain/membership-service.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import { createFakeUserSessionStore } from '../infrastructure/fake-user-session-store.js';
import type { User } from '../domain/user.js';
import type { Organization } from '../domain/organization.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { UserSession } from '../domain/user-session.js';
import type { TokenStore } from '../domain/token-store.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import { principalKindOf } from '../domain/user.js';
import {
  createFakeClock,
  createFakeIdGenerator,
  createFakePasswordHasher,
} from '@yoink/infrastructure';

const USER_SESSION_COOKIE = 'user_session';

describe('token routes', () => {
  let app: FastifyInstance;
  let clock: ReturnType<typeof createFakeClock>;
  let tokenStore: TokenStore;
  let userStore: ReturnType<typeof createFakeUserStore>;
  let membershipStore: ReturnType<typeof createFakeOrganizationMembershipStore>;
  let passwordHasher: ReturnType<typeof createFakePasswordHasher>;

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

  beforeEach(async () => {
    clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const idGenerator = createFakeIdGenerator();
    passwordHasher = createFakePasswordHasher();

    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [testOrg],
    });
    userStore = createFakeUserStore({
      initialUsers: [testUser],
    });
    membershipStore = createFakeOrganizationMembershipStore({
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
      refreshThresholdMs: 24 * 24 * 60 * 60 * 1000,
    });

    const tokenService = createTokenService({
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher,
      clock,
    });

    const tokenHandlers = createTokenHandlers({
      listUserOrgTokens: (userId, organizationId) =>
        tokenStore.findByUserAndOrganization(userId, organizationId),
      load: (id) => tokenStore.findById(id),
      loadMembership: (userId, organizationId) =>
        membershipStore
          .findByUserAndOrg(userId, organizationId)
          .mapErr((error) => tokenStorageError(error.message, error))
          .map((membership) => (membership ? { role: membership.role } : null)),
      loadOwner: (userId) =>
        userStore
          .findById(userId)
          .mapErr((error) => tokenStorageError(error.message, error))
          .map((user) =>
            user
              ? {
                  userId: user.id,
                  name: user.name ?? null,
                  kind: principalKindOf(user),
                }
              : null
          ),
      persist: createStoreBackedTokenPersist(tokenStore),
      hashSecret: (secret) =>
        ResultAsync.fromPromise(
          passwordHasher.hash(secret),
          (error) => tokenStorageError('Failed to hash token secret', error)
        ),
      nextId: () => idGenerator.generate(),
      nextSecret: () => idGenerator.generate(),
      now: () => clock.now().toISOString(),
      maxTokensPerUserPerOrg: 2,
    });

    app = Fastify();
    await app.register(cookie);

    await registerTokenRoutes(app, {
      tokenHandlers,
      sessionService,
      tokenService,
      sessionCookieName: USER_SESSION_COOKIE,
    });

    await app.ready();
  });

  const sessionRequest = async (method: string, url: string, body?: object) => {
    return app.inject({
      method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url,
      cookies: {
        [USER_SESSION_COOKIE]: testSession.id,
      },
      payload: body,
    });
  };

  const bearerRequest = async (method: string, url: string, token: string, body?: object) => {
    return app.inject({
      method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
  };

  describe('GET /api/auth/tokens', () => {
    it('returns an empty complete page when the user has no tokens', async () => {
      const response = await sessionRequest('GET', '/api/auth/tokens');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        tokens: [],
      });
    });

    it('lists the caller tokens with created and last used', async () => {
      await sessionRequest('POST', '/api/auth/tokens', { name: 'Lane' });

      const response = await sessionRequest('GET', '/api/auth/tokens');
      const body = response.json();

      expect(response.statusCode).toBe(200);
      expect(body.tokens[0]).toMatchObject({
        name: 'Lane',
        createdAt: '2024-06-15T12:00:00.000Z',
      });
      expect(body.tokens[0].lastUsedAt).toBeUndefined();
    });

    it('lets a bot token list', async () => {
      const created = await sessionRequest('POST', '/api/auth/tokens', { name: 'Lane' });
      const rawToken = created.json().rawToken;

      const response = await bearerRequest('GET', '/api/auth/tokens', rawToken);
      expect(response.statusCode).toBe(200);
      expect(response.json().tokens[0].name).toBe('Lane');
    });

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/auth/tokens' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/tokens', () => {
    it('creates a named token and returns the raw value once', async () => {
      const response = await sessionRequest('POST', '/api/auth/tokens', { name: 'Lane' });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.token.name).toBe('Lane');
      expect(body.rawToken).toMatch(/^[^:]+:[^:]+$/);
    });

    it('returns 409 when the token limit is reached', async () => {
      await sessionRequest('POST', '/api/auth/tokens', { name: 'Lane' });
      await sessionRequest('POST', '/api/auth/tokens', { name: 'Charlie' });

      const response = await sessionRequest('POST', '/api/auth/tokens', { name: 'Sid' });
      expect(response.statusCode).toBe(409);
      expect(response.json().message).toContain('at most 2');
    });

    it('returns 400 when the name is blank', async () => {
      const response = await sessionRequest('POST', '/api/auth/tokens', { name: '   ' });
      expect(response.statusCode).toBe(400);
    });

    it('returns 403 when a bot token tries to create', async () => {
      const created = await sessionRequest('POST', '/api/auth/tokens', { name: 'Lane' });
      const rawToken = created.json().rawToken;

      const response = await bearerRequest('POST', '/api/auth/tokens', rawToken, {
        name: 'Charlie',
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain('Bot tokens cannot');
    });

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/tokens',
        payload: { name: 'Lane' },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/auth/tokens/:tokenId', () => {
    it('revokes a token so the next request is 401', async () => {
      const created = await sessionRequest('POST', '/api/auth/tokens', { name: 'Lane' });
      const { token, rawToken } = created.json();

      const before = await bearerRequest('GET', '/api/auth/tokens', rawToken);
      expect(before.statusCode).toBe(200);

      const revoked = await sessionRequest('DELETE', `/api/auth/tokens/${token.id}`);
      expect(revoked.statusCode).toBe(200);

      const after = await bearerRequest('GET', '/api/auth/tokens', rawToken);
      expect(after.statusCode).toBe(401);
    });

    it('returns 403 when a bot token tries to revoke', async () => {
      const created = await sessionRequest('POST', '/api/auth/tokens', { name: 'Lane' });
      const { token, rawToken } = created.json();

      const response = await bearerRequest('DELETE', `/api/auth/tokens/${token.id}`, rawToken);
      expect(response.statusCode).toBe(403);
    });

    it('returns 404 when the token does not exist', async () => {
      const response = await sessionRequest('DELETE', '/api/auth/tokens/missing');
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when the token belongs to another organization', async () => {
      await tokenStore.save({
        id: '550e8400-e29b-41d4-a716-446655440066',
        userId: testUser.id,
        organizationId: '550e8400-e29b-41d4-a716-446655440099',
        tokenHash: 'hash',
        name: 'OtherOrg',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const response = await sessionRequest(
        'DELETE',
        '/api/auth/tokens/550e8400-e29b-41d4-a716-446655440066'
      );
      expect(response.statusCode).toBe(404);
    });
  });

  describe('existing tokens keep working', () => {
    it('authenticates a hashed token that was not created through the product route', async () => {
      const secret = 'legacy-secret';
      const tokenId = '550e8400-e29b-41d4-a716-446655440077';
      const tokenHash = await passwordHasher.hash(secret);
      await tokenStore.save({
        id: tokenId,
        userId: testUser.id,
        organizationId: testOrg.id,
        tokenHash,
        name: 'Lane',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const response = await bearerRequest('GET', '/api/auth/tokens', `${tokenId}:${secret}`);
      expect(response.statusCode).toBe(200);
      expect(response.json().tokens[0].name).toBe('Lane');
    });
  });
});
