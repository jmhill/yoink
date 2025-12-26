import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import { createMembershipService, type MembershipService } from './membership-service.js';
import type { OrganizationMembershipStore } from './organization-membership-store.js';
import type { UserStore } from './user-store.js';
import type { OrganizationStore } from './organization-store.js';
import type { User } from './user.js';
import type { Organization } from './organization.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';

describe('MembershipService', () => {
  let service: MembershipService;
  let membershipStore: OrganizationMembershipStore;
  let userStore: UserStore;
  let organizationStore: OrganizationStore;
  let clock: ReturnType<typeof createFakeClock>;
  let idGenerator: ReturnType<typeof createFakeIdGenerator>;

  // Test fixtures
  const testUser: User = {
    id: 'user-1',
    organizationId: 'org-1', // Legacy field, still required
    email: 'alice@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const testOrg: Organization = {
    id: 'org-1',
    name: 'Test Org',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const anotherUser: User = {
    id: 'user-2',
    organizationId: 'org-1',
    email: 'bob@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const anotherOrg: Organization = {
    id: 'org-2',
    name: 'Another Org',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    idGenerator = createFakeIdGenerator();
    membershipStore = createFakeOrganizationMembershipStore();
    userStore = createFakeUserStore({ initialUsers: [testUser, anotherUser] });
    organizationStore = createFakeOrganizationStore({
      initialOrganizations: [testOrg, anotherOrg],
    });

    service = createMembershipService({
      membershipStore,
      userStore,
      organizationStore,
      clock,
      idGenerator,
    });
  });

  describe('addMember', () => {
    it('creates a membership for a user in an organization', async () => {
      const result = await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'member',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.userId).toBe(testUser.id);
        expect(result.value.organizationId).toBe(testOrg.id);
        expect(result.value.role).toBe('member');
        expect(result.value.isPersonalOrg).toBe(false);
        expect(result.value.joinedAt).toBe('2024-06-15T12:00:00.000Z');
      }
    });

    it('creates a personal org membership with isPersonalOrg=true', async () => {
      const result = await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'owner',
        isPersonalOrg: true,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.isPersonalOrg).toBe(true);
        expect(result.value.role).toBe('owner');
      }
    });

    it('fails if user is already a member', async () => {
      // First add
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'member',
      });

      // Second add should fail
      const result = await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('ALREADY_MEMBER');
      }
    });

    it('fails if user does not exist', async () => {
      const result = await service.addMember({
        userId: 'nonexistent-user',
        organizationId: testOrg.id,
        role: 'member',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('fails if organization does not exist', async () => {
      const result = await service.addMember({
        userId: testUser.id,
        organizationId: 'nonexistent-org',
        role: 'member',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('ORGANIZATION_NOT_FOUND');
      }
    });
  });

  describe('removeMember', () => {
    it('removes a member from an organization', async () => {
      // Setup: add member first
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'member',
      });

      const result = await service.removeMember({
        userId: testUser.id,
        organizationId: testOrg.id,
      });

      expect(result.isOk()).toBe(true);

      // Verify membership is gone
      const membership = await service.getMembership({
        userId: testUser.id,
        organizationId: testOrg.id,
      });
      expect(membership.isOk()).toBe(true);
      if (membership.isOk()) {
        expect(membership.value).toBeNull();
      }
    });

    it('fails if trying to leave personal org', async () => {
      // Setup: create personal org membership
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'owner',
        isPersonalOrg: true,
      });

      const result = await service.removeMember({
        userId: testUser.id,
        organizationId: testOrg.id,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CANNOT_LEAVE_PERSONAL_ORG');
      }
    });

    it('fails if membership does not exist', async () => {
      const result = await service.removeMember({
        userId: testUser.id,
        organizationId: testOrg.id,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('MEMBERSHIP_NOT_FOUND');
      }
    });

    it('fails if removing the last admin', async () => {
      // Setup: add user as only admin
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });

      const result = await service.removeMember({
        userId: testUser.id,
        organizationId: testOrg.id,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('LAST_ADMIN');
      }
    });

    it('allows removing admin if another admin exists', async () => {
      // Setup: add two admins
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });
      await service.addMember({
        userId: anotherUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });

      // Remove first admin
      const result = await service.removeMember({
        userId: testUser.id,
        organizationId: testOrg.id,
      });

      expect(result.isOk()).toBe(true);
    });

    it('allows removing member even if they are the only member (not admin)', async () => {
      // Setup: add one member and one admin
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });
      await service.addMember({
        userId: anotherUser.id,
        organizationId: testOrg.id,
        role: 'member',
      });

      // Remove member (not admin) should succeed
      const result = await service.removeMember({
        userId: anotherUser.id,
        organizationId: testOrg.id,
      });

      expect(result.isOk()).toBe(true);
    });
  });

  describe('changeRole', () => {
    it('changes a member role', async () => {
      // Setup
      const addResult = await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'member',
      });
      expect(addResult.isOk()).toBe(true);
      const membershipId = addResult.isOk() ? addResult.value.id : '';

      // Also add another admin so we can demote
      await service.addMember({
        userId: anotherUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });

      const result = await service.changeRole({
        membershipId,
        newRole: 'admin',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.role).toBe('admin');
      }
    });

    it('fails if trying to change owner role', async () => {
      // Setup: create owner membership
      const addResult = await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'owner',
        isPersonalOrg: true,
      });
      expect(addResult.isOk()).toBe(true);
      const membershipId = addResult.isOk() ? addResult.value.id : '';

      const result = await service.changeRole({
        membershipId,
        newRole: 'admin',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CANNOT_CHANGE_OWNER_ROLE');
      }
    });

    it('fails if demoting the last admin', async () => {
      // Setup: only one admin
      const addResult = await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });
      expect(addResult.isOk()).toBe(true);
      const membershipId = addResult.isOk() ? addResult.value.id : '';

      const result = await service.changeRole({
        membershipId,
        newRole: 'member',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('LAST_ADMIN');
      }
    });

    it('allows demoting admin if another admin exists', async () => {
      // Setup: two admins
      const addResult = await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });
      expect(addResult.isOk()).toBe(true);
      const membershipId = addResult.isOk() ? addResult.value.id : '';

      await service.addMember({
        userId: anotherUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });

      const result = await service.changeRole({
        membershipId,
        newRole: 'member',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.role).toBe('member');
      }
    });

    it('fails if membership not found', async () => {
      const result = await service.changeRole({
        membershipId: 'nonexistent',
        newRole: 'admin',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('MEMBERSHIP_NOT_FOUND');
      }
    });
  });

  describe('getMembership', () => {
    it('returns membership if exists', async () => {
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'member',
      });

      const result = await service.getMembership({
        userId: testUser.id,
        organizationId: testOrg.id,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.userId).toBe(testUser.id);
        expect(result.value?.organizationId).toBe(testOrg.id);
      }
    });

    it('returns null if membership does not exist', async () => {
      const result = await service.getMembership({
        userId: testUser.id,
        organizationId: testOrg.id,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('listMemberships', () => {
    it('lists all memberships for a user', async () => {
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'member',
      });
      await service.addMember({
        userId: testUser.id,
        organizationId: anotherOrg.id,
        role: 'admin',
      });

      const result = await service.listMemberships({ userId: testUser.id });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value.map((m) => m.organizationId)).toContain(testOrg.id);
        expect(result.value.map((m) => m.organizationId)).toContain(anotherOrg.id);
      }
    });

    it('lists all members of an organization', async () => {
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });
      await service.addMember({
        userId: anotherUser.id,
        organizationId: testOrg.id,
        role: 'member',
      });

      const result = await service.listMemberships({ organizationId: testOrg.id });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value.map((m) => m.userId)).toContain(testUser.id);
        expect(result.value.map((m) => m.userId)).toContain(anotherUser.id);
      }
    });

    it('returns empty array if no memberships found', async () => {
      const result = await service.listMemberships({ userId: testUser.id });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('hasRole', () => {
    it('returns true if user has the exact required role', async () => {
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });

      const result = await service.hasRole({
        userId: testUser.id,
        organizationId: testOrg.id,
        requiredRole: 'admin',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('returns true if user has higher role than required (owner > admin)', async () => {
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'owner',
        isPersonalOrg: true,
      });

      const result = await service.hasRole({
        userId: testUser.id,
        organizationId: testOrg.id,
        requiredRole: 'admin',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('returns true if user has higher role than required (admin > member)', async () => {
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'admin',
      });

      const result = await service.hasRole({
        userId: testUser.id,
        organizationId: testOrg.id,
        requiredRole: 'member',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('returns false if user has lower role than required', async () => {
      await service.addMember({
        userId: testUser.id,
        organizationId: testOrg.id,
        role: 'member',
      });

      const result = await service.hasRole({
        userId: testUser.id,
        organizationId: testOrg.id,
        requiredRole: 'admin',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });

    it('returns false if user is not a member', async () => {
      const result = await service.hasRole({
        userId: testUser.id,
        organizationId: testOrg.id,
        requiredRole: 'member',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });
  });
});
