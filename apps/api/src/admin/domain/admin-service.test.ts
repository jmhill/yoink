import { describe, it, expect, beforeEach } from 'vitest';
import { createAdminService, type AdminService } from './admin-service.js';
import { createFakeOrganizationStore } from '../../organizations/infrastructure/fake-organization-store.js';
import { createFakeUserStore } from '../../users/infrastructure/fake-user-store.js';
import { createFakeTokenStore } from '../../auth/infrastructure/fake-token-store.js';
import type { Organization } from '../../organizations/domain/organization.js';
import type { User } from '../../users/domain/user.js';
import {
  createFakeClock,
  createFakeIdGenerator,
  createFakePasswordHasher,
} from '@yoink/infrastructure';

describe('AdminService', () => {
  let service: AdminService;
  let organizationStore: ReturnType<typeof createFakeOrganizationStore>;
  let userStore: ReturnType<typeof createFakeUserStore>;
  let tokenStore: ReturnType<typeof createFakeTokenStore>;

  beforeEach(() => {
    organizationStore = createFakeOrganizationStore();
    userStore = createFakeUserStore();
    tokenStore = createFakeTokenStore();

    service = createAdminService({
      organizationStore,
      userStore,
      tokenStore,
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
      idGenerator: createFakeIdGenerator(),
      passwordHasher: createFakePasswordHasher(),
    });
  });

  describe('organizations', () => {
    it('creates an organization', async () => {
      const result = await service.createOrganization('My Org');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.name).toBe('My Org');
        expect(result.value.id).toBeDefined();
        expect(result.value.createdAt).toBe('2024-06-15T12:00:00.000Z');
      }
    });

    it('lists all organizations', async () => {
      await service.createOrganization('Org 1');
      await service.createOrganization('Org 2');

      const result = await service.listOrganizations();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].name).toBe('Org 1');
        expect(result.value[1].name).toBe('Org 2');
      }
    });

    it('gets an organization by ID', async () => {
      const createResult = await service.createOrganization('My Org');
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;

      const findResult = await service.getOrganization(createResult.value.id);

      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(createResult.value);
      }
    });

    it('returns null for non-existent organization', async () => {
      const result = await service.getOrganization('non-existent');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('renames an organization', async () => {
      const createResult = await service.createOrganization('Original Name');
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;

      const renameResult = await service.renameOrganization(
        createResult.value.id,
        'New Name'
      );

      expect(renameResult.isOk()).toBe(true);
      if (renameResult.isOk() && renameResult.value) {
        expect(renameResult.value.id).toBe(createResult.value.id);
        expect(renameResult.value.name).toBe('New Name');
        expect(renameResult.value.createdAt).toBe(createResult.value.createdAt);
      }
    });

    it('returns null when renaming non-existent organization', async () => {
      const result = await service.renameOrganization('non-existent', 'New Name');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('users', () => {
    let testOrg: Organization;

    beforeEach(async () => {
      const result = await service.createOrganization('Test Org');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        testOrg = result.value;
      }
    });

    it('creates a user', async () => {
      const result = await service.createUser(testOrg.id, 'user@example.com');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.email).toBe('user@example.com');
        expect(result.value.organizationId).toBe(testOrg.id);
        expect(result.value.createdAt).toBe('2024-06-15T12:00:00.000Z');
      }
    });

    it('lists users in an organization', async () => {
      await service.createUser(testOrg.id, 'user1@example.com');
      await service.createUser(testOrg.id, 'user2@example.com');

      const result = await service.listUsers(testOrg.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('only lists users for the specified organization', async () => {
      const otherOrgResult = await service.createOrganization('Other Org');
      expect(otherOrgResult.isOk()).toBe(true);
      if (!otherOrgResult.isOk()) return;

      await service.createUser(testOrg.id, 'user1@example.com');
      await service.createUser(otherOrgResult.value.id, 'user2@example.com');

      const result = await service.listUsers(testOrg.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].email).toBe('user1@example.com');
      }
    });

    it('gets a user by ID', async () => {
      const createResult = await service.createUser(testOrg.id, 'user@example.com');
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;

      const findResult = await service.getUser(createResult.value.id);

      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(createResult.value);
      }
    });

    it('returns null for non-existent user', async () => {
      const result = await service.getUser('non-existent');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('tokens', () => {
    let testUser: User;

    beforeEach(async () => {
      const orgResult = await service.createOrganization('Test Org');
      expect(orgResult.isOk()).toBe(true);
      if (!orgResult.isOk()) return;

      const userResult = await service.createUser(orgResult.value.id, 'user@example.com');
      expect(userResult.isOk()).toBe(true);
      if (userResult.isOk()) {
        testUser = userResult.value;
      }
    });

    it('creates a token and returns raw token value', async () => {
      const result = await service.createToken(testUser.id, 'my-device');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.token.name).toBe('my-device');
        expect(result.value.token.userId).toBe(testUser.id);
        expect(result.value.rawToken).toContain(':');
        expect(result.value.rawToken.startsWith(result.value.token.id)).toBe(true);
      }
    });

    it('does not include tokenHash in returned token', async () => {
      const result = await service.createToken(testUser.id, 'my-device');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // The token view should not have tokenHash
        expect((result.value.token as Record<string, unknown>).tokenHash).toBeUndefined();
      }
    });

    it('lists tokens for a user without tokenHash', async () => {
      await service.createToken(testUser.id, 'device-1');
      await service.createToken(testUser.id, 'device-2');

      const result = await service.listTokens(testUser.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        result.value.forEach((token) => {
          expect((token as Record<string, unknown>).tokenHash).toBeUndefined();
        });
      }
    });

    it('revokes (deletes) a token', async () => {
      const createResult = await service.createToken(testUser.id, 'my-device');
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;

      const revokeResult = await service.revokeToken(createResult.value.token.id);
      expect(revokeResult.isOk()).toBe(true);

      const listResult = await service.listTokens(testUser.id);
      expect(listResult.isOk()).toBe(true);
      if (listResult.isOk()) {
        expect(listResult.value).toHaveLength(0);
      }
    });
  });
});
