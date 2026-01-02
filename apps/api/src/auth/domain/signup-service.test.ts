import { describe, it, expect, beforeEach } from 'vitest';
import { createSignupService, type SignupService } from './signup-service.js';
import { createFakeInvitationStore } from '../../organizations/infrastructure/fake-invitation-store.js';
import { createFakeUserStore } from '../../users/infrastructure/fake-user-store.js';
import { createFakeOrganizationStore } from '../../organizations/infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../../organizations/infrastructure/fake-organization-membership-store.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Invitation } from '../../organizations/domain/invitation.js';
import type { Organization } from '../../organizations/domain/organization.js';

const TEST_ORG: Organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Acme Corp',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const createTestInvitation = (overrides: Partial<Invitation> = {}): Invitation => ({
  id: '550e8400-e29b-41d4-a716-446655440100',
  code: 'ABCD1234',
  email: 'alice@example.com',
  organizationId: TEST_ORG.id,
  invitedByUserId: '550e8400-e29b-41d4-a716-446655440002',
  role: 'member',
  expiresAt: '2024-12-31T00:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('SignupService', () => {
  let service: SignupService;
  let clock: ReturnType<typeof createFakeClock>;
  let idGenerator: ReturnType<typeof createFakeIdGenerator>;
  let invitationStore: ReturnType<typeof createFakeInvitationStore>;
  let userStore: ReturnType<typeof createFakeUserStore>;
  let organizationStore: ReturnType<typeof createFakeOrganizationStore>;
  let membershipStore: ReturnType<typeof createFakeOrganizationMembershipStore>;

  beforeEach(async () => {
    clock = createFakeClock(new Date('2024-06-15T10:00:00.000Z'));
    idGenerator = createFakeIdGenerator();
    invitationStore = createFakeInvitationStore();
    userStore = createFakeUserStore();
    organizationStore = createFakeOrganizationStore({ initialOrganizations: [TEST_ORG] });
    membershipStore = createFakeOrganizationMembershipStore();

    service = createSignupService({
      invitationStore,
      userStore,
      organizationStore,
      membershipStore,
      clock,
      idGenerator,
    });
  });

  describe('validateSignupRequest', () => {
    it('returns invitation details when valid code and email', async () => {
      const invitation = createTestInvitation();
      await invitationStore.save(invitation);

      const result = await service.validateSignupRequest({
        code: 'ABCD1234',
        email: 'alice@example.com',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.invitation).toEqual(invitation);
        expect(result.value.organization).toEqual(TEST_ORG);
      }
    });

    it('rejects when invitation not found', async () => {
      const result = await service.validateSignupRequest({
        code: 'INVALID',
        email: 'alice@example.com',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_NOT_FOUND');
      }
    });

    it('rejects when invitation expired', async () => {
      const invitation = createTestInvitation({
        expiresAt: '2024-01-01T00:00:00.000Z', // Before current clock time
      });
      await invitationStore.save(invitation);

      const result = await service.validateSignupRequest({
        code: 'ABCD1234',
        email: 'alice@example.com',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_EXPIRED');
      }
    });

    it('rejects when invitation already accepted', async () => {
      const invitation = createTestInvitation({
        acceptedAt: '2024-06-01T00:00:00.000Z',
        acceptedByUserId: 'some-user-id',
      });
      await invitationStore.save(invitation);

      const result = await service.validateSignupRequest({
        code: 'ABCD1234',
        email: 'alice@example.com',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_ALREADY_ACCEPTED');
      }
    });

    it('rejects when email does not match invitation restriction', async () => {
      const invitation = createTestInvitation({
        email: 'alice@example.com',
      });
      await invitationStore.save(invitation);

      const result = await service.validateSignupRequest({
        code: 'ABCD1234',
        email: 'bob@example.com',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('INVITATION_EMAIL_MISMATCH');
      }
    });

    it('rejects when email already registered', async () => {
      const invitation = createTestInvitation();
      await invitationStore.save(invitation);

      // Register a user with the same email
      await userStore.save({
        id: 'existing-user',
        email: 'alice@example.com',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await service.validateSignupRequest({
        code: 'ABCD1234',
        email: 'alice@example.com',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('EMAIL_ALREADY_REGISTERED');
      }
    });

    it('accepts invitation without email restriction', async () => {
      const invitation = createTestInvitation({
        email: null, // No email restriction
      });
      await invitationStore.save(invitation);

      const result = await service.validateSignupRequest({
        code: 'ABCD1234',
        email: 'anyone@example.com',
      });

      expect(result.isOk()).toBe(true);
    });
  });

  describe('completeSignup', () => {
    it('creates user, personal org, and memberships', async () => {
      const invitation = createTestInvitation();
      await invitationStore.save(invitation);

      const result = await service.completeSignup({
        code: 'ABCD1234',
        email: 'alice@example.com',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { user, personalOrganization, invitedOrganization } = result.value;

        // User created
        expect(user.email).toBe('alice@example.com');

        // Personal org created and named after email
        expect(personalOrganization.name).toBe("alice@example.com's Workspace");

        // Invited org info
        expect(invitedOrganization.id).toBe(TEST_ORG.id);
        expect(invitedOrganization.name).toBe(TEST_ORG.name);
        expect(invitedOrganization.role).toBe('member');
      }
    });

    it('creates membership as owner in personal org', async () => {
      const invitation = createTestInvitation();
      await invitationStore.save(invitation);

      const result = await service.completeSignup({
        code: 'ABCD1234',
        email: 'alice@example.com',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const personalMembership = await membershipStore.findByUserAndOrg(
          result.value.user.id,
          result.value.personalOrganization.id
        );
        expect(personalMembership.isOk()).toBe(true);
        if (personalMembership.isOk() && personalMembership.value) {
          expect(personalMembership.value.role).toBe('owner');
          expect(personalMembership.value.isPersonalOrg).toBe(true);
        }
      }
    });

    it('creates membership in invited org with invitation role', async () => {
      const invitation = createTestInvitation({ role: 'admin' });
      await invitationStore.save(invitation);

      const result = await service.completeSignup({
        code: 'ABCD1234',
        email: 'alice@example.com',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const invitedMembership = await membershipStore.findByUserAndOrg(
          result.value.user.id,
          TEST_ORG.id
        );
        expect(invitedMembership.isOk()).toBe(true);
        if (invitedMembership.isOk() && invitedMembership.value) {
          expect(invitedMembership.value.role).toBe('admin');
          expect(invitedMembership.value.isPersonalOrg).toBe(false);
        }
      }
    });

    it('marks invitation as accepted', async () => {
      const invitation = createTestInvitation();
      await invitationStore.save(invitation);

      const result = await service.completeSignup({
        code: 'ABCD1234',
        email: 'alice@example.com',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const updatedInvitation = await invitationStore.findByCode('ABCD1234');
        expect(updatedInvitation.isOk()).toBe(true);
        if (updatedInvitation.isOk() && updatedInvitation.value) {
          expect(updatedInvitation.value.acceptedAt).not.toBeNull();
          expect(updatedInvitation.value.acceptedByUserId).toBe(result.value.user.id);
        }
      }
    });

    it('rejects when email already registered', async () => {
      const invitation = createTestInvitation();
      await invitationStore.save(invitation);

      // Register a user with the same email
      await userStore.save({
        id: 'existing-user',
        email: 'alice@example.com',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await service.completeSignup({
        code: 'ABCD1234',
        email: 'alice@example.com',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('EMAIL_ALREADY_REGISTERED');
      }
    });
  });
});
