import { describe, it, expect, beforeEach } from 'vitest';
import { createMembershipService, type MembershipService } from './membership-service.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createUserService } from '../../users/domain/user-service.js';
import { createFakeUserStore } from '../../users/infrastructure/fake-user-store.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Organization } from './organization.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { User } from '../../users/domain/user.js';

const TEST_DATE = new Date('2024-01-15T10:00:00.000Z');

const createTestOrg = (overrides: Partial<Organization> = {}): Organization => ({
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const createTestMembership = (overrides: Partial<OrganizationMembership> = {}): OrganizationMembership => ({
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('MembershipService', () => {
  let service: MembershipService;
  let userStore: ReturnType<typeof createFakeUserStore>;
  let organizationStore: ReturnType<typeof createFakeOrganizationStore>;
  let membershipStore: ReturnType<typeof createFakeOrganizationMembershipStore>;

  beforeEach(() => {
    userStore = createFakeUserStore();
    organizationStore = createFakeOrganizationStore();
    membershipStore = createFakeOrganizationMembershipStore();

    const userService = createUserService({ userStore });

    service = createMembershipService({
      membershipStore,
      userService,
      organizationStore,
      clock: createFakeClock(TEST_DATE),
      idGenerator: createFakeIdGenerator(['gen-membership-1', 'gen-membership-2']),
    });
  });

  describe('addMember', () => {
    it('adds a user to an organization', async () => {
      const org = createTestOrg();
      const user = createTestUser();
      await organizationStore.save(org);
      await userStore.save(user);

      const result = await service.addMember({
        userId: user.id,
        organizationId: org.id,
        role: 'member',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('gen-membership-1');
        expect(result.value.userId).toBe(user.id);
        expect(result.value.organizationId).toBe(org.id);
        expect(result.value.role).toBe('member');
        expect(result.value.isPersonalOrg).toBe(false);
        expect(result.value.joinedAt).toBe(TEST_DATE.toISOString());
      }
    });

    it('returns USER_NOT_FOUND when user does not exist', async () => {
      const org = createTestOrg();
      await organizationStore.save(org);

      const result = await service.addMember({
        userId: 'non-existent-user',
        organizationId: org.id,
        role: 'member',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('returns ORGANIZATION_NOT_FOUND when organization does not exist', async () => {
      const user = createTestUser();
      await userStore.save(user);

      const result = await service.addMember({
        userId: user.id,
        organizationId: 'non-existent-org',
        role: 'member',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('ORGANIZATION_NOT_FOUND');
      }
    });

    it('returns ALREADY_MEMBER when user is already a member', async () => {
      const org = createTestOrg();
      const user = createTestUser();
      const existingMembership = createTestMembership({
        userId: user.id,
        organizationId: org.id,
      });
      await organizationStore.save(org);
      await userStore.save(user);
      await membershipStore.save(existingMembership);

      const result = await service.addMember({
        userId: user.id,
        organizationId: org.id,
        role: 'member',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('ALREADY_MEMBER');
      }
    });
  });

  describe('removeMember', () => {
    it('removes a user from an organization', async () => {
      const org = createTestOrg();
      const user = createTestUser();
      const admin = createTestUser({ id: 'admin-user', email: 'admin@example.com' });
      const membership = createTestMembership({
        userId: user.id,
        organizationId: org.id,
        role: 'member',
      });
      const adminMembership = createTestMembership({
        id: 'admin-membership',
        userId: admin.id,
        organizationId: org.id,
        role: 'admin',
      });
      await organizationStore.save(org);
      await userStore.save(user);
      await userStore.save(admin);
      await membershipStore.save(membership);
      await membershipStore.save(adminMembership);

      const result = await service.removeMember({
        userId: user.id,
        organizationId: org.id,
      });

      expect(result.isOk()).toBe(true);

      // Verify membership is removed
      const findResult = await membershipStore.findByUserAndOrg(user.id, org.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toBeNull();
      }
    });

    it('returns MEMBERSHIP_NOT_FOUND when membership does not exist', async () => {
      const result = await service.removeMember({
        userId: 'non-existent-user',
        organizationId: 'non-existent-org',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('MEMBERSHIP_NOT_FOUND');
      }
    });

    it('returns CANNOT_LEAVE_PERSONAL_ORG when trying to leave personal org', async () => {
      const org = createTestOrg();
      const user = createTestUser();
      const personalMembership = createTestMembership({
        userId: user.id,
        organizationId: org.id,
        isPersonalOrg: true,
        role: 'owner',
      });
      await organizationStore.save(org);
      await userStore.save(user);
      await membershipStore.save(personalMembership);

      const result = await service.removeMember({
        userId: user.id,
        organizationId: org.id,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CANNOT_LEAVE_PERSONAL_ORG');
      }
    });

    it('returns LAST_ADMIN when trying to remove the only admin', async () => {
      const org = createTestOrg();
      const admin = createTestUser();
      const adminMembership = createTestMembership({
        userId: admin.id,
        organizationId: org.id,
        role: 'admin',
      });
      await organizationStore.save(org);
      await userStore.save(admin);
      await membershipStore.save(adminMembership);

      const result = await service.removeMember({
        userId: admin.id,
        organizationId: org.id,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('LAST_ADMIN');
      }
    });
  });

  describe('listMemberships', () => {
    it('lists memberships by user ID', async () => {
      const user = createTestUser();
      const org1 = createTestOrg({ id: 'org-1', name: 'Org 1' });
      const org2 = createTestOrg({ id: 'org-2', name: 'Org 2' });
      const membership1 = createTestMembership({ id: 'm-1', userId: user.id, organizationId: org1.id });
      const membership2 = createTestMembership({ id: 'm-2', userId: user.id, organizationId: org2.id });

      await userStore.save(user);
      await organizationStore.save(org1);
      await organizationStore.save(org2);
      await membershipStore.save(membership1);
      await membershipStore.save(membership2);

      const result = await service.listMemberships({ userId: user.id });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('lists memberships by organization ID', async () => {
      const org = createTestOrg();
      const user1 = createTestUser({ id: 'user-1', email: 'user1@example.com' });
      const user2 = createTestUser({ id: 'user-2', email: 'user2@example.com' });
      const membership1 = createTestMembership({ id: 'm-1', userId: user1.id, organizationId: org.id });
      const membership2 = createTestMembership({ id: 'm-2', userId: user2.id, organizationId: org.id });

      await organizationStore.save(org);
      await userStore.save(user1);
      await userStore.save(user2);
      await membershipStore.save(membership1);
      await membershipStore.save(membership2);

      const result = await service.listMemberships({ organizationId: org.id });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
      }
    });
  });

  describe('hasRole', () => {
    it('returns true when user has the required role', async () => {
      const org = createTestOrg();
      const user = createTestUser();
      const membership = createTestMembership({
        userId: user.id,
        organizationId: org.id,
        role: 'admin',
      });
      await organizationStore.save(org);
      await userStore.save(user);
      await membershipStore.save(membership);

      const result = await service.hasRole({
        userId: user.id,
        organizationId: org.id,
        requiredRole: 'member',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('returns false when user does not have the required role', async () => {
      const org = createTestOrg();
      const user = createTestUser();
      const membership = createTestMembership({
        userId: user.id,
        organizationId: org.id,
        role: 'member',
      });
      await organizationStore.save(org);
      await userStore.save(user);
      await membershipStore.save(membership);

      const result = await service.hasRole({
        userId: user.id,
        organizationId: org.id,
        requiredRole: 'admin',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });

    it('returns false when user is not a member', async () => {
      const result = await service.hasRole({
        userId: 'non-member',
        organizationId: 'some-org',
        requiredRole: 'member',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });
  });
});
