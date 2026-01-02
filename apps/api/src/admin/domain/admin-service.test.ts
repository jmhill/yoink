import { describe, it, expect, beforeEach } from 'vitest';
import { createAdminService, type AdminService } from './admin-service.js';
import { createFakeOrganizationStore } from '../../organizations/infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../../organizations/infrastructure/fake-organization-membership-store.js';
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
  let organizationMembershipStore: ReturnType<typeof createFakeOrganizationMembershipStore>;
  let userStore: ReturnType<typeof createFakeUserStore>;
  let tokenStore: ReturnType<typeof createFakeTokenStore>;

  beforeEach(() => {
    organizationStore = createFakeOrganizationStore();
    organizationMembershipStore = createFakeOrganizationMembershipStore();
    userStore = createFakeUserStore();
    tokenStore = createFakeTokenStore();

    service = createAdminService({
      organizationStore,
      organizationMembershipStore,
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

  describe('users (read-only)', () => {
    let testOrg: Organization;
    let testUser: User;

    beforeEach(async () => {
      const orgResult = await service.createOrganization('Test Org');
      expect(orgResult.isOk()).toBe(true);
      if (orgResult.isOk()) {
        testOrg = orgResult.value;
      }

      // Users are now created via signup flow, so we add them directly to the store
      // along with their membership
      testUser = {
        id: 'user-1',
        email: 'user@example.com',
        createdAt: '2024-06-15T12:00:00.000Z',
      };
      await userStore.save(testUser);
      await organizationMembershipStore.save({
        id: 'membership-1',
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'member',
        isPersonalOrg: false,
        joinedAt: '2024-06-15T12:00:00.000Z',
      });
    });

    it('lists users in an organization', async () => {
      const user2: User = {
        id: 'user-2',
        email: 'user2@example.com',
        createdAt: '2024-06-15T12:00:00.000Z',
      };
      await userStore.save(user2);
      await organizationMembershipStore.save({
        id: 'membership-2',
        userId: user2.id,
        organizationId: testOrg.id,
        role: 'member',
        isPersonalOrg: false,
        joinedAt: '2024-06-15T12:00:00.000Z',
      });

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

      const otherUser: User = {
        id: 'other-user',
        email: 'other@example.com',
        createdAt: '2024-06-15T12:00:00.000Z',
      };
      await userStore.save(otherUser);
      // This user is a member of the OTHER org, not testOrg
      await organizationMembershipStore.save({
        id: 'membership-other',
        userId: otherUser.id,
        organizationId: otherOrgResult.value.id,
        role: 'member',
        isPersonalOrg: false,
        joinedAt: '2024-06-15T12:00:00.000Z',
      });

      const result = await service.listUsers(testOrg.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].email).toBe('user@example.com');
      }
    });

    it('gets a user by ID', async () => {
      const findResult = await service.getUser(testUser.id);

      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(testUser);
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

  describe('tokens (scoped to organizations)', () => {
    let testOrg: Organization;
    let testUser: User;

    beforeEach(async () => {
      const orgResult = await service.createOrganization('Test Org');
      expect(orgResult.isOk()).toBe(true);
      if (!orgResult.isOk()) return;
      testOrg = orgResult.value;

      // Users are created via signup flow
      testUser = {
        id: 'user-1',
        email: 'user@example.com',
        createdAt: '2024-06-15T12:00:00.000Z',
      };
      await userStore.save(testUser);
    });

    it('creates a token scoped to an organization', async () => {
      const result = await service.createToken({
        organizationId: testOrg.id,
        userId: testUser.id,
        name: 'my-device',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.token.name).toBe('my-device');
        expect(result.value.token.userId).toBe(testUser.id);
        expect(result.value.token.organizationId).toBe(testOrg.id);
        expect(result.value.rawToken).toContain(':');
        expect(result.value.rawToken.startsWith(result.value.token.id)).toBe(true);
      }
    });

    it('does not include tokenHash in returned token', async () => {
      const result = await service.createToken({
        organizationId: testOrg.id,
        userId: testUser.id,
        name: 'my-device',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // The token view should not have tokenHash
        expect((result.value.token as Record<string, unknown>).tokenHash).toBeUndefined();
      }
    });

    it('lists tokens for an organization without tokenHash', async () => {
      await service.createToken({
        organizationId: testOrg.id,
        userId: testUser.id,
        name: 'device-1',
      });
      await service.createToken({
        organizationId: testOrg.id,
        userId: testUser.id,
        name: 'device-2',
      });

      const result = await service.listTokens(testOrg.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        result.value.forEach((token) => {
          expect((token as Record<string, unknown>).tokenHash).toBeUndefined();
          expect(token.organizationId).toBe(testOrg.id);
        });
      }
    });

    it('only lists tokens for the specified organization', async () => {
      const otherOrgResult = await service.createOrganization('Other Org');
      expect(otherOrgResult.isOk()).toBe(true);
      if (!otherOrgResult.isOk()) return;

      await service.createToken({
        organizationId: testOrg.id,
        userId: testUser.id,
        name: 'device-1',
      });
      await service.createToken({
        organizationId: otherOrgResult.value.id,
        userId: testUser.id,
        name: 'device-2',
      });

      const result = await service.listTokens(testOrg.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].name).toBe('device-1');
      }
    });

    it('revokes (deletes) a token', async () => {
      const createResult = await service.createToken({
        organizationId: testOrg.id,
        userId: testUser.id,
        name: 'my-device',
      });
      expect(createResult.isOk()).toBe(true);
      if (!createResult.isOk()) return;

      const revokeResult = await service.revokeToken(createResult.value.token.id);
      expect(revokeResult.isOk()).toBe(true);

      const listResult = await service.listTokens(testOrg.id);
      expect(listResult.isOk()).toBe(true);
      if (listResult.isOk()) {
        expect(listResult.value).toHaveLength(0);
      }
    });
  });
});
