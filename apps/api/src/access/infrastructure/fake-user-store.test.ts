import { describe, it, expect } from 'vitest';
import { createFakeUserStore } from './fake-user-store.js';
import type { User } from '../domain/user.js';

const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-123',
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createFakeUserStore', () => {
  describe('save', () => {
    it('persists a user', async () => {
      const store = createFakeUserStore();
      const user = createTestUser();

      const saveResult = await store.save(user);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(user.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(user);
      }
    });

    it('returns error when configured to fail', async () => {
      const store = createFakeUserStore({ shouldFailOnSave: true });
      const user = createTestUser();

      const result = await store.save(user);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_STORAGE_ERROR');
      }
    });
  });

  describe('findById', () => {
    it('returns null when user not found', async () => {
      const store = createFakeUserStore();

      const result = await store.findById('non-existent');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('returns user from initial users', async () => {
      const user = createTestUser({ id: 'initial-user' });
      const store = createFakeUserStore({ initialUsers: [user] });

      const result = await store.findById('initial-user');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(user);
      }
    });

    it('returns error when configured to fail', async () => {
      const store = createFakeUserStore({ shouldFailOnFind: true });

      const result = await store.findById('any-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_STORAGE_ERROR');
      }
    });
  });

  describe('findByIds', () => {
    it('returns users matching the ids', async () => {
      const user1 = createTestUser({ id: 'user-1', email: 'user1@example.com' });
      const user2 = createTestUser({ id: 'user-2', email: 'user2@example.com' });
      const user3 = createTestUser({ id: 'user-3', email: 'user3@example.com' });
      const store = createFakeUserStore({ initialUsers: [user1, user2, user3] });

      const result = await store.findByIds(['user-1', 'user-3']);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value.map(u => u.id)).toContain('user-1');
        expect(result.value.map(u => u.id)).toContain('user-3');
      }
    });

    it('returns empty array when no ids match', async () => {
      const store = createFakeUserStore();

      const result = await store.findByIds(['non-existent']);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns error when configured to fail', async () => {
      const store = createFakeUserStore({ shouldFailOnFind: true });

      const result = await store.findByIds(['any-id']);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_STORAGE_ERROR');
      }
    });
  });

  describe('findByEmail', () => {
    it('returns user when found by email', async () => {
      const user = createTestUser({ email: 'alice@example.com' });
      const store = createFakeUserStore({ initialUsers: [user] });

      const result = await store.findByEmail('alice@example.com');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(user);
      }
    });

    it('returns null when user not found by email', async () => {
      const store = createFakeUserStore();

      const result = await store.findByEmail('nonexistent@example.com');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });
});
