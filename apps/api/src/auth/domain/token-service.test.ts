import { describe, it, expect, beforeEach } from 'vitest';
import { createTokenService, type TokenService } from './token-service.js';
import type { Organization } from './organization.js';
import type { User } from './user.js';
import type { ApiToken } from './api-token.js';
import type { OrganizationStore } from './organization-store.js';
import type { UserStore } from './user-store.js';
import type { TokenStore } from './token-store.js';
import { createFakePasswordHasher, createFakeClock } from '@yoink/infrastructure';

describe('TokenService', () => {
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
    tokenHash: 'fake-hash:my-secret-token',
    name: 'test-token',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  // Token format: tokenId:secret
  const VALID_TOKEN = `${testToken.id}:my-secret-token`;

  let tokenService: TokenService;
  let organizationStore: OrganizationStore;
  let userStore: UserStore;
  let tokenStore: TokenStore;
  let lastUsedUpdates: Array<{ id: string; timestamp: string }>;

  beforeEach(() => {
    lastUsedUpdates = [];

    organizationStore = {
      save: async () => {},
      findById: async (id) => (id === testOrg.id ? testOrg : null),
    };

    userStore = {
      save: async () => {},
      findById: async (id) => (id === testUser.id ? testUser : null),
    };

    tokenStore = {
      save: async () => {},
      findById: async (id) => (id === testToken.id ? testToken : null),
      updateLastUsed: async (id, timestamp) => {
        lastUsedUpdates.push({ id, timestamp });
      },
      hasAnyTokens: async () => true,
    };

    const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));

    tokenService = createTokenService({
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      clock,
    });
  });

  it('returns auth result for valid token', async () => {
    const result = await tokenService.validateToken(VALID_TOKEN);

    expect(result).not.toBeNull();
    expect(result?.organization).toEqual(testOrg);
    expect(result?.user).toEqual(testUser);
    expect(result?.token.id).toBe(testToken.id);
  });

  it('returns null for wrong secret', async () => {
    const result = await tokenService.validateToken(`${testToken.id}:wrong-secret`);

    expect(result).toBeNull();
  });

  it('returns null for non-existent token id', async () => {
    const result = await tokenService.validateToken('non-existent-id:my-secret-token');

    expect(result).toBeNull();
  });

  it('returns null for missing colon separator', async () => {
    const result = await tokenService.validateToken('my-secret-token');

    expect(result).toBeNull();
  });

  it('returns null for empty token id', async () => {
    const result = await tokenService.validateToken(':my-secret-token');

    expect(result).toBeNull();
  });

  it('returns null for empty secret', async () => {
    const result = await tokenService.validateToken(`${testToken.id}:`);

    expect(result).toBeNull();
  });

  it('returns null when token exists but user not found', async () => {
    userStore.findById = async () => null;

    const result = await tokenService.validateToken(VALID_TOKEN);

    expect(result).toBeNull();
  });

  it('returns null when user exists but organization not found', async () => {
    organizationStore.findById = async () => null;

    const result = await tokenService.validateToken(VALID_TOKEN);

    expect(result).toBeNull();
  });

  it('updates lastUsedAt on successful validation', async () => {
    await tokenService.validateToken(VALID_TOKEN);

    expect(lastUsedUpdates).toHaveLength(1);
    expect(lastUsedUpdates[0].id).toBe(testToken.id);
    expect(lastUsedUpdates[0].timestamp).toBe('2024-06-15T12:00:00.000Z');
  });

  it('does not update lastUsedAt on failed validation', async () => {
    await tokenService.validateToken(`${testToken.id}:wrong-secret`);

    expect(lastUsedUpdates).toHaveLength(0);
  });
});
