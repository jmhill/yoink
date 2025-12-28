import { describe, it, expect, beforeEach } from 'vitest';
import { createUserService, type UserService } from './user-service.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import type { User } from './user.js';
import type { UserStore } from './user-store.js';

const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: '550e8400-e29b-41d4-a716-446655440001',
  organizationId: '550e8400-e29b-41d4-a716-446655440002',
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('UserService', () => {
  let userStore: UserStore;
  let service: UserService;

  beforeEach(() => {
    userStore = createFakeUserStore();
    service = createUserService({ userStore });
  });

  describe('getUser', () => {
    it('returns user when found', async () => {
      const user = createTestUser();
      await userStore.save(user);

      const result = await service.getUser(user.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(user);
      }
    });

    it('returns null when user not found', async () => {
      const result = await service.getUser('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('propagates storage errors', async () => {
      const failingStore = createFakeUserStore({ shouldFailOnFind: true });
      const failingService = createUserService({ userStore: failingStore });

      const result = await failingService.getUser('any-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_STORAGE_ERROR');
      }
    });
  });

  describe('getUsersByOrganization', () => {
    it('returns users for the organization', async () => {
      const orgId = '550e8400-e29b-41d4-a716-446655440010';
      const user1 = createTestUser({ id: 'user-1', organizationId: orgId });
      const user2 = createTestUser({ id: 'user-2', organizationId: orgId });
      await userStore.save(user1);
      await userStore.save(user2);

      const result = await service.getUsersByOrganization(orgId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value.map(u => u.id)).toContain('user-1');
        expect(result.value.map(u => u.id)).toContain('user-2');
      }
    });

    it('returns empty array when no users exist for organization', async () => {
      const result = await service.getUsersByOrganization('org-with-no-users');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('propagates storage errors', async () => {
      const failingStore = createFakeUserStore({ shouldFailOnFind: true });
      const failingService = createUserService({ userStore: failingStore });

      const result = await failingService.getUsersByOrganization('any-org');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_STORAGE_ERROR');
      }
    });
  });

  describe('createUser', () => {
    it('creates and returns a new user', async () => {
      const command = {
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: '550e8400-e29b-41d4-a716-446655440002',
        email: 'new@example.com',
        createdAt: '2024-06-01T00:00:00.000Z',
      };

      const result = await service.createUser(command);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe(command.id);
        expect(result.value.email).toBe('new@example.com');
        expect(result.value.organizationId).toBe(command.organizationId);
      }

      // Verify user is persisted
      const findResult = await service.getUser(command.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.email).toBe('new@example.com');
      }
    });

    it('propagates storage errors on save', async () => {
      const failingStore = createFakeUserStore({ shouldFailOnSave: true });
      const failingService = createUserService({ userStore: failingStore });

      const result = await failingService.createUser({
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: '550e8400-e29b-41d4-a716-446655440002',
        email: 'new@example.com',
        createdAt: '2024-06-01T00:00:00.000Z',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_STORAGE_ERROR');
      }
    });
  });
});
