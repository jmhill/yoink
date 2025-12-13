import { describe, it, expect, beforeEach } from 'vitest';
import { createAdminService, type AdminService } from './admin-service.js';
import type { OrganizationStore } from '../../auth/domain/organization-store.js';
import type { UserStore } from '../../auth/domain/user-store.js';
import type { TokenStore } from '../../auth/domain/token-store.js';
import type { Organization } from '../../auth/domain/organization.js';
import type { User } from '../../auth/domain/user.js';
import type { ApiToken } from '../../auth/domain/api-token.js';
import {
  createFakeClock,
  createFakeIdGenerator,
  createFakePasswordHasher,
} from '@yoink/infrastructure';

describe('AdminService', () => {
  let service: AdminService;
  let organizations: Organization[];
  let users: User[];
  let tokens: ApiToken[];

  const organizationStore: OrganizationStore = {
    save: async (org) => {
      organizations.push(org);
    },
    findById: async (id) => organizations.find((o) => o.id === id) ?? null,
    findAll: async () => organizations,
  };

  const userStore: UserStore = {
    save: async (user) => {
      users.push(user);
    },
    findById: async (id) => users.find((u) => u.id === id) ?? null,
    findByOrganizationId: async (orgId) =>
      users.filter((u) => u.organizationId === orgId),
  };

  const tokenStore: TokenStore = {
    save: async (token) => {
      tokens.push(token);
    },
    findById: async (id) => tokens.find((t) => t.id === id) ?? null,
    findByUserId: async (userId) => tokens.filter((t) => t.userId === userId),
    updateLastUsed: async () => {},
    delete: async (id) => {
      tokens = tokens.filter((t) => t.id !== id);
    },
    hasAnyTokens: async () => tokens.length > 0,
  };

  beforeEach(() => {
    organizations = [];
    users = [];
    tokens = [];

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
      const org = await service.createOrganization('My Org');

      expect(org.name).toBe('My Org');
      expect(org.id).toBeDefined();
      expect(org.createdAt).toBe('2024-06-15T12:00:00.000Z');
      expect(organizations).toContainEqual(org);
    });

    it('lists all organizations', async () => {
      await service.createOrganization('Org 1');
      await service.createOrganization('Org 2');

      const result = await service.listOrganizations();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Org 1');
      expect(result[1].name).toBe('Org 2');
    });

    it('gets an organization by ID', async () => {
      const created = await service.createOrganization('My Org');

      const found = await service.getOrganization(created.id);

      expect(found).toEqual(created);
    });

    it('returns null for non-existent organization', async () => {
      const found = await service.getOrganization('non-existent');

      expect(found).toBeNull();
    });
  });

  describe('users', () => {
    let testOrg: Organization;

    beforeEach(async () => {
      testOrg = await service.createOrganization('Test Org');
    });

    it('creates a user', async () => {
      const user = await service.createUser(testOrg.id, 'user@example.com');

      expect(user.email).toBe('user@example.com');
      expect(user.organizationId).toBe(testOrg.id);
      expect(user.createdAt).toBe('2024-06-15T12:00:00.000Z');
      expect(users).toContainEqual(user);
    });

    it('lists users in an organization', async () => {
      await service.createUser(testOrg.id, 'user1@example.com');
      await service.createUser(testOrg.id, 'user2@example.com');

      const result = await service.listUsers(testOrg.id);

      expect(result).toHaveLength(2);
    });

    it('only lists users for the specified organization', async () => {
      const otherOrg = await service.createOrganization('Other Org');
      await service.createUser(testOrg.id, 'user1@example.com');
      await service.createUser(otherOrg.id, 'user2@example.com');

      const result = await service.listUsers(testOrg.id);

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('user1@example.com');
    });

    it('gets a user by ID', async () => {
      const created = await service.createUser(testOrg.id, 'user@example.com');

      const found = await service.getUser(created.id);

      expect(found).toEqual(created);
    });

    it('returns null for non-existent user', async () => {
      const found = await service.getUser('non-existent');

      expect(found).toBeNull();
    });
  });

  describe('tokens', () => {
    let testUser: User;

    beforeEach(async () => {
      const org = await service.createOrganization('Test Org');
      testUser = await service.createUser(org.id, 'user@example.com');
    });

    it('creates a token and returns raw token value', async () => {
      const result = await service.createToken(testUser.id, 'my-device');

      expect(result.token.name).toBe('my-device');
      expect(result.token.userId).toBe(testUser.id);
      expect(result.rawToken).toContain(':');
      expect(result.rawToken.startsWith(result.token.id)).toBe(true);
    });

    it('does not include tokenHash in returned token', async () => {
      const result = await service.createToken(testUser.id, 'my-device');

      // The token view should not have tokenHash
      expect((result.token as Record<string, unknown>).tokenHash).toBeUndefined();
    });

    it('lists tokens for a user without tokenHash', async () => {
      await service.createToken(testUser.id, 'device-1');
      await service.createToken(testUser.id, 'device-2');

      const result = await service.listTokens(testUser.id);

      expect(result).toHaveLength(2);
      result.forEach((token) => {
        expect((token as Record<string, unknown>).tokenHash).toBeUndefined();
      });
    });

    it('revokes (deletes) a token', async () => {
      const created = await service.createToken(testUser.id, 'my-device');

      await service.revokeToken(created.token.id);

      const result = await service.listTokens(testUser.id);
      expect(result).toHaveLength(0);
    });
  });
});
