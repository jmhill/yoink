import { describe, it, expect, beforeEach } from 'vitest';
import { createInvitationService, type InvitationService } from './invitation-service.js';
import { createFakeInvitationStore } from '../infrastructure/fake-invitation-store.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Organization } from './organization.js';
import type { OrganizationMembership } from './organization-membership.js';

const TEST_ORG: Organization = {
  id: 'org-001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const TEST_ADMIN_MEMBERSHIP: OrganizationMembership = {
  id: 'membership-001',
  userId: 'user-admin',
  organizationId: TEST_ORG.id,
  role: 'admin',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

describe('InvitationService', () => {
  let service: InvitationService;
  let invitationStore: ReturnType<typeof createFakeInvitationStore>;
  let organizationStore: ReturnType<typeof createFakeOrganizationStore>;
  let membershipStore: ReturnType<typeof createFakeOrganizationMembershipStore>;
  let clock: ReturnType<typeof createFakeClock>;
  let idGenerator: ReturnType<typeof createFakeIdGenerator>;
  let codeGenerator: { generate: () => string };

  beforeEach(() => {
    invitationStore = createFakeInvitationStore();
    organizationStore = createFakeOrganizationStore({
      initialOrganizations: [TEST_ORG],
    });
    membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [TEST_ADMIN_MEMBERSHIP],
    });
    clock = createFakeClock(new Date('2024-01-15T12:00:00.000Z'));
    idGenerator = createFakeIdGenerator();
    codeGenerator = { generate: () => 'TESTCODE' };

    service = createInvitationService({
      invitationStore,
      organizationStore,
      membershipStore,
      clock,
      idGenerator,
      codeGenerator,
    });
  });

  describe('createInvitation', () => {
    it('creates an invitation with default 7-day expiry', async () => {
      const result = await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const invitation = result.value;
        expect(invitation.code).toBe('TESTCODE');
        expect(invitation.organizationId).toBe(TEST_ORG.id);
        expect(invitation.invitedByUserId).toBe('user-admin');
        expect(invitation.role).toBe('member');
        expect(invitation.email).toBeNull();
        expect(invitation.acceptedAt).toBeNull();
        // 7 days from Jan 15 = Jan 22
        expect(invitation.expiresAt).toBe('2024-01-22T12:00:00.000Z');
      }
    });

    it('creates an invitation with email restriction', async () => {
      const result = await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
        email: 'specific@example.com',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.email).toBe('specific@example.com');
      }
    });

    it('creates an invitation for admin role', async () => {
      const result = await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'admin',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.role).toBe('admin');
      }
    });

    it('fails when organization does not exist', async () => {
      const result = await service.createInvitation({
        organizationId: 'non-existent-org',
        invitedByUserId: 'user-admin',
        role: 'member',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_ORG_NOT_FOUND');
      }
    });

    it('fails when inviter is not a member', async () => {
      const result = await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'non-member-user',
        role: 'member',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INSUFFICIENT_INVITE_PERMISSIONS');
      }
    });

    it('fails when inviter is only a member (not admin)', async () => {
      // Add a regular member
      await membershipStore.save({
        id: 'membership-002',
        userId: 'user-member',
        organizationId: TEST_ORG.id,
        role: 'member',
        isPersonalOrg: false,
        joinedAt: '2024-01-02T00:00:00.000Z',
      });

      const result = await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-member',
        role: 'member',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INSUFFICIENT_INVITE_PERMISSIONS');
      }
    });

    describe('admin-created invitations (skipPermissionCheck)', () => {
      it('allows invitation creation with null invitedByUserId when skipPermissionCheck is true', async () => {
        const result = await service.createInvitation({
          organizationId: TEST_ORG.id,
          invitedByUserId: null,
          role: 'member',
          skipPermissionCheck: true,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.invitedByUserId).toBeNull();
          expect(result.value.organizationId).toBe(TEST_ORG.id);
          expect(result.value.role).toBe('member');
        }
      });

      it('fails when invitedByUserId is null and skipPermissionCheck is false', async () => {
        const result = await service.createInvitation({
          organizationId: TEST_ORG.id,
          invitedByUserId: null,
          role: 'member',
          skipPermissionCheck: false,
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.type).toBe('INSUFFICIENT_INVITE_PERMISSIONS');
        }
      });

      it('fails when invitedByUserId is null and skipPermissionCheck is not specified', async () => {
        const result = await service.createInvitation({
          organizationId: TEST_ORG.id,
          invitedByUserId: null,
          role: 'member',
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.type).toBe('INSUFFICIENT_INVITE_PERMISSIONS');
        }
      });

      it('respects custom expiresInDays when using skipPermissionCheck', async () => {
        const result = await service.createInvitation({
          organizationId: TEST_ORG.id,
          invitedByUserId: null,
          role: 'admin',
          expiresInDays: 30,
          skipPermissionCheck: true,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          // 30 days from Jan 15 = Feb 14
          expect(result.value.expiresAt).toBe('2024-02-14T12:00:00.000Z');
          expect(result.value.role).toBe('admin');
        }
      });

      it('allows admin-created invitation with email restriction', async () => {
        const result = await service.createInvitation({
          organizationId: TEST_ORG.id,
          invitedByUserId: null,
          role: 'member',
          email: 'invited@example.com',
          skipPermissionCheck: true,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.email).toBe('invited@example.com');
          expect(result.value.invitedByUserId).toBeNull();
        }
      });

      it('still validates organization exists even with skipPermissionCheck', async () => {
        const result = await service.createInvitation({
          organizationId: 'non-existent-org',
          invitedByUserId: null,
          role: 'member',
          skipPermissionCheck: true,
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.type).toBe('INVITATION_ORG_NOT_FOUND');
        }
      });
    });
  });

  describe('validateInvitation', () => {
    it('returns valid invitation when code exists and is not expired or accepted', async () => {
      // Create an invitation first
      await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
      });

      const result = await service.validateInvitation({ code: 'TESTCODE' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.code).toBe('TESTCODE');
        expect(result.value.organizationId).toBe(TEST_ORG.id);
      }
    });

    it('fails when invitation code does not exist', async () => {
      const result = await service.validateInvitation({ code: 'NONEXIST' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_NOT_FOUND');
      }
    });

    it('fails when invitation has expired', async () => {
      // Create invitation
      await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
      });

      // Advance time past expiration (8 days later)
      clock.advanceBy(8 * 24 * 60 * 60 * 1000);

      const result = await service.validateInvitation({ code: 'TESTCODE' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_EXPIRED');
      }
    });

    it('fails when invitation has already been accepted', async () => {
      // Create invitation
      const createResult = await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
      });

      // Manually mark as accepted
      if (createResult.isOk()) {
        const accepted = {
          ...createResult.value,
          acceptedAt: '2024-01-16T00:00:00.000Z',
          acceptedByUserId: 'some-user',
        };
        await invitationStore.save(accepted);
      }

      const result = await service.validateInvitation({ code: 'TESTCODE' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_ALREADY_ACCEPTED');
      }
    });

    it('validates email matches when invitation has email restriction', async () => {
      await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
        email: 'specific@example.com',
      });

      const result = await service.validateInvitation({
        code: 'TESTCODE',
        email: 'specific@example.com',
      });

      expect(result.isOk()).toBe(true);
    });

    it('fails when email does not match restriction', async () => {
      await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
        email: 'specific@example.com',
      });

      const result = await service.validateInvitation({
        code: 'TESTCODE',
        email: 'different@example.com',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_EMAIL_MISMATCH');
      }
    });
  });

  describe('acceptInvitation', () => {
    it('marks invitation as accepted', async () => {
      await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
      });

      const result = await service.acceptInvitation({
        code: 'TESTCODE',
        userId: 'new-user-id',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.acceptedAt).toBe('2024-01-15T12:00:00.000Z');
        expect(result.value.acceptedByUserId).toBe('new-user-id');
      }

      // Verify stored
      const stored = await invitationStore.findByCode('TESTCODE');
      if (stored.isOk() && stored.value) {
        expect(stored.value.acceptedAt).toBe('2024-01-15T12:00:00.000Z');
      }
    });

    it('fails when invitation does not exist', async () => {
      const result = await service.acceptInvitation({
        code: 'NONEXIST',
        userId: 'new-user-id',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_NOT_FOUND');
      }
    });

    it('fails when invitation is expired', async () => {
      await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
      });

      // Advance time past expiration
      clock.advanceBy(8 * 24 * 60 * 60 * 1000);

      const result = await service.acceptInvitation({
        code: 'TESTCODE',
        userId: 'new-user-id',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_EXPIRED');
      }
    });

    it('fails when invitation is already accepted', async () => {
      await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
      });

      // Accept it once
      await service.acceptInvitation({
        code: 'TESTCODE',
        userId: 'first-user',
      });

      // Try to accept again
      const result = await service.acceptInvitation({
        code: 'TESTCODE',
        userId: 'second-user',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_ALREADY_ACCEPTED');
      }
    });
  });

  describe('listPendingInvitations', () => {
    it('returns empty array when no invitations exist', async () => {
      const result = await service.listPendingInvitations({
        organizationId: TEST_ORG.id,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns only pending (not accepted, not expired) invitations', async () => {
      // Create a pending invitation
      let codeCounter = 1;
      codeGenerator.generate = () => `CODE${codeCounter++}`;

      await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'member',
      });

      await service.createInvitation({
        organizationId: TEST_ORG.id,
        invitedByUserId: 'user-admin',
        role: 'admin',
      });

      const result = await service.listPendingInvitations({
        organizationId: TEST_ORG.id,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
      }
    });
  });
});
