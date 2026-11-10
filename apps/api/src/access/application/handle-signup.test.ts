import { describe, it, expect, beforeEach } from 'vitest';
import { errAsync } from 'neverthrow';
import { OWNER_INVITE_WRONG_EMAIL_MESSAGE } from '@yoink/api-contracts';
import { createSignupService, type SignupService } from './handle-signup.js';
import { createFakeInvitationStore } from '../infrastructure/fake-invitation-store.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { UnitOfWork } from '../../kernel/unit-of-work.js';
import type { Invitation } from '../domain/invitation.js';
import type { Organization } from '../domain/organization.js';

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
  replacedAt: null,
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
    const unitOfWork: UnitOfWork = {
      commit: () =>
        errAsync({
          kind: 'Storage',
          owner: 'access',
          owners: ['access'],
          reason: 'validate wrote',
        }),
    };

    service = createSignupService({
      invitationStore,
      userStore,
      organizationStore,
      membershipStore,
      clock,
      idGenerator,
      unitOfWork,
      verifySignupCredential: null,
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
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
        if (result.error.type === 'INVITATION_EMAIL_MISMATCH') {
          expect(result.error.message).toBe(OWNER_INVITE_WRONG_EMAIL_MESSAGE);
        }
      }
    });

    it('matches a restricted email ignoring capitals', async () => {
      const invitation = createTestInvitation({
        email: 'alice@example.com',
      });
      await invitationStore.save(invitation);

      const result = await service.validateSignupRequest({
        code: 'ABCD1234',
        email: 'Alice@Example.COM',
      });

      expect(result.isOk()).toBe(true);
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
});
