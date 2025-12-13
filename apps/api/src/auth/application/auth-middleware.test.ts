import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createAuthMiddleware } from './auth-middleware.js';
import { createTokenService } from '../domain/token-service.js';
import type { Organization } from '../domain/organization.js';
import type { User } from '../domain/user.js';
import type { ApiToken } from '../domain/api-token.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { UserStore } from '../domain/user-store.js';
import type { TokenStore } from '../domain/token-store.js';
import { createFakePasswordHasher, createFakeClock } from '@yoink/infrastructure';

describe('authMiddleware', () => {
  let app: FastifyInstance;

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

  const testToken: ApiToken = {
    id: '550e8400-e29b-41d4-a716-446655440003',
    userId: testUser.id,
    tokenHash: 'fake-hash:valid-token',
    name: 'test-token',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    const organizationStore: OrganizationStore = {
      save: async () => {},
      findById: async (id) => (id === testOrg.id ? testOrg : null),
    };

    const userStore: UserStore = {
      save: async () => {},
      findById: async (id) => (id === testUser.id ? testUser : null),
    };

    const tokenStore: TokenStore = {
      save: async () => {},
      findById: async (id) => (id === testToken.id ? testToken : null),
      updateLastUsed: async () => {},
      hasAnyTokens: async () => true,
    };

    const tokenService = createTokenService({
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
    });

    const authMiddleware = createAuthMiddleware({ tokenService });

    app = Fastify();
    app.addHook('preHandler', authMiddleware);

    app.get('/test', async (request) => {
      return { authContext: request.authContext };
    });

    await app.ready();
  });

  it('attaches auth context for valid token', async () => {
    // Token format: tokenId:secret
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
  });

  it('returns 401 for missing Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Missing authorization header');
  });

  it('returns 401 for non-Bearer authorization', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Missing authorization header');
  });

  it('returns 401 for invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer wrong-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Invalid token');
  });
});
