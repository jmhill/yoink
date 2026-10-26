import { describe, it, expect, beforeEach } from 'vitest';
import { createTokenService, type TokenService } from './token-service.js';
import type { Organization } from './organization.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import type { User } from './user.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import type { ApiToken } from './api-token.js';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import {
  createBcryptPasswordHasher,
  createFakePasswordHasher,
  createFakeClock,
} from '@yoink/infrastructure';

describe('TokenService', () => {
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

  const testToken: ApiToken = {
    id: '550e8400-e29b-41d4-a716-446655440003',
    userId: testUser.id,
    organizationId: testOrg.id,
    tokenHash: 'fake-hash:my-secret-token',
    name: 'test-token',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  // Token format: tokenId:secret
  const VALID_TOKEN = `${testToken.id}:my-secret-token`;

  let tokenService: TokenService;
  let tokenStore: ReturnType<typeof createFakeTokenStore>;

  beforeEach(() => {
    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [testOrg],
    });

    const userStore = createFakeUserStore({
      initialUsers: [testUser],
    });

    tokenStore = createFakeTokenStore({
      initialTokens: [testToken],
    });

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
    const result = await tokenService.validateToken({ plaintext: VALID_TOKEN });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.organization).toEqual(testOrg);
      expect(result.value.user).toEqual(testUser);
      expect(result.value.token.id).toBe(testToken.id);
    }
  });

  it('returns INVALID_SECRET error for wrong secret', async () => {
    const result = await tokenService.validateToken({
      plaintext: `${testToken.id}:wrong-secret`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_SECRET');
    }
  });

  it('returns TOKEN_NOT_FOUND error for non-existent token id', async () => {
    const result = await tokenService.validateToken({
      plaintext: 'non-existent-id:my-secret-token',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_NOT_FOUND');
    }
  });

  it('returns INVALID_TOKEN_FORMAT error for missing colon separator', async () => {
    const result = await tokenService.validateToken({
      plaintext: 'my-secret-token',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_FORMAT');
    }
  });

  it('returns INVALID_TOKEN_FORMAT error for empty token id', async () => {
    const result = await tokenService.validateToken({
      plaintext: ':my-secret-token',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_FORMAT');
    }
  });

  it('returns INVALID_TOKEN_FORMAT error for empty secret', async () => {
    const result = await tokenService.validateToken({
      plaintext: `${testToken.id}:`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_FORMAT');
    }
  });

  it('returns TOKEN_NOT_FOUND for the user when the token exists but the user does not', async () => {
    // Create a token for a non-existent user
    const orphanToken: ApiToken = {
      id: 'orphan-token-id',
      userId: 'non-existent-user',
      organizationId: testOrg.id,
      tokenHash: 'fake-hash:orphan-secret',
      name: 'orphan-token',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    tokenStore = createFakeTokenStore({ initialTokens: [orphanToken] });
    const userStore = createFakeUserStore({ initialUsers: [] });
    const organizationStore = createFakeOrganizationStore({ initialOrganizations: [testOrg] });

    tokenService = createTokenService({
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
    });

    const result = await tokenService.validateToken({
      plaintext: 'orphan-token-id:orphan-secret',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        type: 'TOKEN_NOT_FOUND',
        tokenId: orphanToken.id,
        subject: 'user',
      });
    }
  });

  it('returns TOKEN_NOT_FOUND for the organization when the user exists but the organization does not', async () => {
    // Create user belonging to non-existent org
    const orphanUser: User = {
      id: 'orphan-user-id',
      email: 'orphan@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const orphanToken: ApiToken = {
      id: 'orphan-token-id',
      userId: orphanUser.id,
      organizationId: 'non-existent-org',
      tokenHash: 'fake-hash:orphan-secret',
      name: 'orphan-token',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const organizationStore = createFakeOrganizationStore({ initialOrganizations: [] });
    const userStore = createFakeUserStore({ initialUsers: [orphanUser] });
    tokenStore = createFakeTokenStore({ initialTokens: [orphanToken] });

    tokenService = createTokenService({
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
    });

    const result = await tokenService.validateToken({
      plaintext: 'orphan-token-id:orphan-secret',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        type: 'TOKEN_NOT_FOUND',
        tokenId: orphanToken.id,
        subject: 'organization',
      });
    }
  });

  it('updates lastUsedAt on successful validation', async () => {
    await tokenService.validateToken({ plaintext: VALID_TOKEN });

    // Check the token was updated in the store
    const findResult = await tokenStore.findById(testToken.id);
    expect(findResult.isOk()).toBe(true);
    if (findResult.isOk()) {
      expect(findResult.value?.lastUsedAt).toBe('2024-06-15T12:00:00.000Z');
    }
  });

  it('rejects a revoked token after comparing the secret', async () => {
    await tokenStore.revoke(testToken.id, '2026-10-09T12:00:00.000Z');

    const result = await tokenService.validateToken({ plaintext: VALID_TOKEN });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: 'TOKEN_REVOKED', tokenId: testToken.id });
    }
  });

  it('returns TOKEN_STORAGE_ERROR with the token id when a lookup fails', async () => {
    const failingStore = createFakeTokenStore({
      shouldFailOnFind: true,
      initialTokens: [testToken],
    });
    const service = createTokenService({
      organizationStore: createFakeOrganizationStore({ initialOrganizations: [testOrg] }),
      userStore: createFakeUserStore({ initialUsers: [testUser] }),
      tokenStore: failingStore,
      passwordHasher: createFakePasswordHasher(),
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
    });

    const result = await service.validateToken({ plaintext: VALID_TOKEN });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_STORAGE_ERROR');
      if (result.error.type === 'TOKEN_STORAGE_ERROR') {
        expect(result.error.tokenId).toBe(testToken.id);
        expect(JSON.stringify(result.error)).not.toContain('my-secret-token');
      }
    }
  });

  it('returns TOKEN_STORAGE_ERROR when the user lookup fails', async () => {
    const service = createTokenService({
      organizationStore: createFakeOrganizationStore({ initialOrganizations: [testOrg] }),
      userStore: createFakeUserStore({ shouldFailOnFind: true, initialUsers: [testUser] }),
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
    });

    const result = await service.validateToken({ plaintext: VALID_TOKEN });

    expect(result.isErr() && result.error.type).toBe('TOKEN_STORAGE_ERROR');
  });

  it('returns TOKEN_STORAGE_ERROR when the organization lookup fails', async () => {
    const service = createTokenService({
      organizationStore: createFakeOrganizationStore({
        shouldFailOnFind: true,
        initialOrganizations: [testOrg],
      }),
      userStore: createFakeUserStore({ initialUsers: [testUser] }),
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
    });

    const result = await service.validateToken({ plaintext: VALID_TOKEN });

    expect(result.isErr() && result.error.type).toBe('TOKEN_STORAGE_ERROR');
  });

  it('returns TOKEN_HASH_ERROR when comparing the secret throws', async () => {
    const cause = new Error('bcrypt stalled');
    const service = createTokenService({
      organizationStore: createFakeOrganizationStore({ initialOrganizations: [testOrg] }),
      userStore: createFakeUserStore({ initialUsers: [testUser] }),
      tokenStore,
      passwordHasher: {
        hash: () => Promise.resolve('unused'),
        compare: () => {
          throw cause;
        },
      },
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
    });

    const result = await service.validateToken({ plaintext: VALID_TOKEN });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        type: 'TOKEN_HASH_ERROR',
        tokenId: testToken.id,
        cause,
      });
      expect(JSON.stringify(result.error)).not.toContain('my-secret-token');
    }
  });

  it('reports a missing token as not found when bcrypt compares the dummy hash', async () => {
    const service = createTokenService({
      organizationStore: createFakeOrganizationStore({ initialOrganizations: [testOrg] }),
      userStore: createFakeUserStore({ initialUsers: [testUser] }),
      tokenStore: createFakeTokenStore({ initialTokens: [] }),
      passwordHasher: createBcryptPasswordHasher(),
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
    });

    const result = await service.validateToken({
      plaintext: '550e8400-e29b-41d4-a716-446655440099:not-the-dummy-password',
    });

    expect(result.isErr() && result.error).toMatchObject({
      type: 'TOKEN_NOT_FOUND',
      subject: 'token',
    });
  });

  it('does not update lastUsedAt on failed validation', async () => {
    await tokenService.validateToken({
      plaintext: `${testToken.id}:wrong-secret`,
    });

    // Check the token was not updated
    const findResult = await tokenStore.findById(testToken.id);
    expect(findResult.isOk()).toBe(true);
    if (findResult.isOk()) {
      expect(findResult.value?.lastUsedAt).toBeUndefined();
    }
  });

  it('performs constant-time validation even for non-existent tokens (timing attack protection)', async () => {
    // Track whether password hasher was called
    let compareCallCount = 0;
    const trackingPasswordHasher = {
      ...createFakePasswordHasher(),
      compare: async (plain: string, hash: string) => {
        compareCallCount++;
        // Fake hasher returns true if hash starts with 'fake-hash:' followed by plain
        return hash === `fake-hash:${plain}`;
      },
    };

    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [testOrg],
    });
    const userStore = createFakeUserStore({
      initialUsers: [testUser],
    });
    const tokenStore = createFakeTokenStore({
      initialTokens: [testToken],
    });

    const service = createTokenService({
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: trackingPasswordHasher,
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
    });

    // Attempt validation with non-existent token ID
    await service.validateToken({
      plaintext: 'non-existent-id:any-secret',
    });

    // The password hasher should still be called even for non-existent tokens
    // This ensures constant-time behavior to prevent timing oracle attacks
    expect(compareCallCount).toBe(1);
  });
});
