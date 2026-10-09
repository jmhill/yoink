import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createSqliteTokenStore } from './sqlite-token-store.js';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { createSqliteUserStore } from './sqlite-user-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStore } from '../domain/token-store.js';

const TEST_ORG = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const TEST_USER = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  organizationId: TEST_ORG.id,
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const createTestToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  id: '550e8400-e29b-41d4-a716-446655440003',
  userId: TEST_USER.id,
  organizationId: TEST_ORG.id,
  tokenHash: 'bcrypt-hash-here',
  name: 'default-token',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteTokenStore', () => {
  let db: Database;
  let store: TokenStore;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clear data between tests (respecting foreign key order)
    await db.execute({ sql: 'DELETE FROM api_tokens' });
    await db.execute({ sql: 'DELETE FROM captures' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });

    // Create required parent records
    const orgStore = await createSqliteOrganizationStore(db);
    await orgStore.save(TEST_ORG);

    const userStore = await createSqliteUserStore(db);
    await userStore.save(TEST_USER);

    store = await createSqliteTokenStore(db);
  });

  describe('save', () => {
    it('persists a token', async () => {
      const token = createTestToken();

      const saveResult = await store.save(token);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(token.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(token);
      }
    });

    it('persists token with lastUsedAt', async () => {
      const token = createTestToken({
        lastUsedAt: '2024-06-15T12:00:00.000Z',
      });

      const saveResult = await store.save(token);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(token.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.lastUsedAt).toBe('2024-06-15T12:00:00.000Z');
      }
    });
  });

  describe('findById', () => {
    it('returns token when found', async () => {
      const token = createTestToken({ name: 'My Token' });
      await store.save(token);

      const result = await store.findById(token.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.name).toBe('My Token');
      }
    });

    it('returns null when token not found', async () => {
      const result = await store.findById('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('updateLastUsed', () => {
    it('updates lastUsedAt timestamp', async () => {
      const token = createTestToken();
      await store.save(token);

      const updateResult = await store.updateLastUsed(token.id, '2024-06-20T15:30:00.000Z');

      expect(updateResult.isOk()).toBe(true);

      const findResult = await store.findById(token.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.lastUsedAt).toBe('2024-06-20T15:30:00.000Z');
      }
    });
  });

  describe('hasAnyTokens', () => {
    it('returns false when no tokens exist', async () => {
      const result = await store.hasAnyTokens();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });

    it('returns true when tokens exist', async () => {
      await store.save(createTestToken());

      const result = await store.hasAnyTokens();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });
  });

  describe('findByUserId', () => {
    it('returns empty array when no tokens exist for user', async () => {
      const result = await store.findByUserId(TEST_USER.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns all tokens for the user ordered by createdAt desc', async () => {
      const token1 = createTestToken({
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'first-token',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      const token2 = createTestToken({
        id: '550e8400-e29b-41d4-a716-446655440004',
        name: 'second-token',
        createdAt: '2024-02-01T00:00:00.000Z',
      });
      await store.save(token1);
      await store.save(token2);

      const result = await store.findByUserId(TEST_USER.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].name).toBe('second-token');
        expect(result.value[1].name).toBe('first-token');
      }
    });

    it('only returns tokens for the specified user', async () => {
      const token = createTestToken();
      await store.save(token);

      const result = await store.findByUserId('other-user-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('findByUserAndOrganization', () => {
    it('returns empty array when no tokens exist', async () => {
      const result = await store.findByUserAndOrganization(TEST_USER.id, TEST_ORG.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns tokens for the specified user and organization', async () => {
      const token = createTestToken({ name: 'my-token' });
      await store.save(token);

      const result = await store.findByUserAndOrganization(TEST_USER.id, TEST_ORG.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].name).toBe('my-token');
      }
    });

    it('does not return tokens from other organizations', async () => {
      // This would fail FK constraint with a real other-org, so we just verify filtering works
      // by saving a valid token and querying with a different org
      await store.save(createTestToken());

      const result = await store.findByUserAndOrganization(TEST_USER.id, 'other-org-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('does not return tokens from other users', async () => {
      await store.save(createTestToken());

      const result = await store.findByUserAndOrganization('other-user-id', TEST_ORG.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns tokens ordered by createdAt desc', async () => {
      const token1 = createTestToken({
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'first-token',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      const token2 = createTestToken({
        id: '550e8400-e29b-41d4-a716-446655440004',
        name: 'second-token',
        createdAt: '2024-02-01T00:00:00.000Z',
      });
      await store.save(token1);
      await store.save(token2);

      const result = await store.findByUserAndOrganization(TEST_USER.id, TEST_ORG.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].name).toBe('second-token');
        expect(result.value[1].name).toBe('first-token');
      }
    });
  });

  describe('revoke', () => {
    it('soft-deletes a token so lists hide it and findById still resolves the name', async () => {
      const token = createTestToken({ name: 'Lane' });
      await store.save(token);

      const revokeResult = await store.revoke(token.id, '2026-10-09T12:00:00.000Z');
      expect(revokeResult.isOk()).toBe(true);

      const findResult = await store.findById(token.id);
      expect(findResult._unsafeUnwrap()?.name).toBe('Lane');
      expect(findResult._unsafeUnwrap()?.revokedAt).toBe('2026-10-09T12:00:00.000Z');

      const listed = await store.findByOrganizationId(TEST_ORG.id);
      expect(listed._unsafeUnwrap()).toEqual([]);
    });

    it('succeeds when revoking a non-existent token', async () => {
      const result = await store.revoke('non-existent-id', '2026-10-09T12:00:00.000Z');
      expect(result.isOk()).toBe(true);
    });
  });

  describe('unique constraint', () => {
    it('maps a primary-key collision to a storage error', async () => {
      await store.save(createTestToken({ name: 'Lane' }));

      const result = await store.save(createTestToken({ name: 'Charlie' }));

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('TOKEN_STORAGE_ERROR');
        expect(result.error.message).toBe('Failed to save token');
      }
    });
  });

  describe('reissue', () => {
    it('revokes the old token and inserts the new one in one write', async () => {
      const oldToken = createTestToken({ name: 'Tycho' });
      await store.save(oldToken);

      const result = await store.reissue({
        userId: TEST_USER.id,
        organizationId: TEST_ORG.id,
        revokedAt: '2026-10-09T12:00:00.000Z',
        token: createTestToken({
          id: '550e8400-e29b-41d4-a716-446655440099',
          name: 'Tycho',
          tokenHash: 'new-hash',
          createdAt: '2026-10-09T12:00:00.000Z',
        }),
      });

      expect(result.isOk()).toBe(true);
      expect((await store.findById(oldToken.id))._unsafeUnwrap()?.revokedAt).toBe(
        '2026-10-09T12:00:00.000Z'
      );
      const listed = await store.findByUserAndOrganization(TEST_USER.id, TEST_ORG.id);
      expect(listed._unsafeUnwrap()).toHaveLength(1);
      expect(listed._unsafeUnwrap()[0]?.id).toBe('550e8400-e29b-41d4-a716-446655440099');
    });

    it('revokes every live token for the user and org', async () => {
      const first = createTestToken({ name: 'Tycho' });
      const second = createTestToken({
        id: '550e8400-e29b-41d4-a716-446655440004',
        name: 'Tycho-2',
      });
      await store.save(first);
      await store.save(second);

      const result = await store.reissue({
        userId: TEST_USER.id,
        organizationId: TEST_ORG.id,
        revokedAt: '2026-10-09T12:00:00.000Z',
        token: createTestToken({
          id: '550e8400-e29b-41d4-a716-446655440099',
          name: 'Tycho',
          tokenHash: 'new-hash',
          createdAt: '2026-10-09T12:00:00.000Z',
        }),
      });

      expect(result.isOk()).toBe(true);
      expect((await store.findById(first.id))._unsafeUnwrap()?.revokedAt).toBe(
        '2026-10-09T12:00:00.000Z'
      );
      expect((await store.findById(second.id))._unsafeUnwrap()?.revokedAt).toBe(
        '2026-10-09T12:00:00.000Z'
      );
      const listed = await store.findByUserAndOrganization(TEST_USER.id, TEST_ORG.id);
      expect(listed._unsafeUnwrap()).toHaveLength(1);
      expect(listed._unsafeUnwrap()[0]?.id).toBe('550e8400-e29b-41d4-a716-446655440099');
    });
  });
});
