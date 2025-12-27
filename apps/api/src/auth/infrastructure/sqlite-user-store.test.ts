import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createSqliteUserStore } from './sqlite-user-store.js';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import type { User } from '../domain/user.js';
import type { UserStore } from '../domain/user-store.js';

const TEST_ORG = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: '550e8400-e29b-41d4-a716-446655440002',
  organizationId: TEST_ORG.id,
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteUserStore', () => {
  let db: Database;
  let store: UserStore;

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

    // Create required parent organization
    const orgStore = await createSqliteOrganizationStore(db);
    await orgStore.save(TEST_ORG);

    store = await createSqliteUserStore(db);
  });

  describe('save', () => {
    it('persists a user', async () => {
      const user = createTestUser();

      const saveResult = await store.save(user);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(user.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(user);
      }
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      const user = createTestUser({ email: 'alice@example.com' });
      await store.save(user);

      const result = await store.findById(user.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.email).toBe('alice@example.com');
      }
    });

    it('returns null when user not found', async () => {
      const result = await store.findById('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('findByOrganizationId', () => {
    it('returns empty array when no users exist for organization', async () => {
      const result = await store.findByOrganizationId(TEST_ORG.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns all users for the organization ordered by createdAt desc', async () => {
      const user1 = createTestUser({
        id: '550e8400-e29b-41d4-a716-446655440002',
        email: 'first@example.com',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      const user2 = createTestUser({
        id: '550e8400-e29b-41d4-a716-446655440003',
        email: 'second@example.com',
        createdAt: '2024-02-01T00:00:00.000Z',
      });
      await store.save(user1);
      await store.save(user2);

      const result = await store.findByOrganizationId(TEST_ORG.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].email).toBe('second@example.com');
        expect(result.value[1].email).toBe('first@example.com');
      }
    });

    it('only returns users for the specified organization', async () => {
      const user = createTestUser();
      await store.save(user);

      const result = await store.findByOrganizationId('other-org-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });
});
