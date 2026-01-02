import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createSqliteUserStore } from './sqlite-user-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import type { User } from '../domain/user.js';
import type { UserStore } from '../domain/user-store.js';

const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: '550e8400-e29b-41d4-a716-446655440002',
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

  describe('findByIds', () => {
    it('returns empty array when no ids provided', async () => {
      const result = await store.findByIds([]);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns all users matching the ids ordered by createdAt desc', async () => {
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
      const user3 = createTestUser({
        id: '550e8400-e29b-41d4-a716-446655440004',
        email: 'third@example.com',
        createdAt: '2024-03-01T00:00:00.000Z',
      });
      await store.save(user1);
      await store.save(user2);
      await store.save(user3);

      const result = await store.findByIds([user1.id, user2.id]);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].email).toBe('second@example.com');
        expect(result.value[1].email).toBe('first@example.com');
      }
    });

    it('returns empty array when no users match the ids', async () => {
      const user = createTestUser();
      await store.save(user);

      const result = await store.findByIds(['non-existent-id']);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('findByEmail', () => {
    it('returns user when found by email', async () => {
      const user = createTestUser({ email: 'alice@example.com' });
      await store.save(user);

      const result = await store.findByEmail('alice@example.com');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.email).toBe('alice@example.com');
        expect(result.value?.id).toBe(user.id);
      }
    });

    it('returns null when user not found by email', async () => {
      const result = await store.findByEmail('nonexistent@example.com');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });
});
