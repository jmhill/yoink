import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createSqliteInvitationStore } from './sqlite-invitation-store.js';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { createSqliteUserStore } from '../../users/infrastructure/sqlite-user-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import type { Invitation } from '../domain/invitation.js';
import type { InvitationStore } from '../domain/invitation-store.js';

const TEST_ORG = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const TEST_USER = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  organizationId: TEST_ORG.id,
  email: 'inviter@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const createTestInvitation = (overrides: Partial<Invitation> = {}): Invitation => ({
  id: '550e8400-e29b-41d4-a716-446655440003',
  code: 'ABCD1234',
  email: null,
  organizationId: TEST_ORG.id,
  invitedByUserId: TEST_USER.id,
  role: 'member',
  expiresAt: '2024-01-08T00:00:00.000Z', // 7 days from createdAt
  acceptedAt: null,
  acceptedByUserId: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteInvitationStore', () => {
  let db: Database;
  let store: InvitationStore;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clear data between tests (respecting foreign key order)
    await db.execute({ sql: 'DELETE FROM invitations' });
    await db.execute({ sql: 'DELETE FROM api_tokens' });
    await db.execute({ sql: 'DELETE FROM captures' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });

    // Create required parent records
    const orgStore = await createSqliteOrganizationStore(db);
    await orgStore.save(TEST_ORG);

    const userStore = await createSqliteUserStore(db);
    await userStore.save(TEST_USER);

    store = await createSqliteInvitationStore(db);
  });

  describe('save', () => {
    it('persists an invitation', async () => {
      const invitation = createTestInvitation();

      const saveResult = await store.save(invitation);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(invitation.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(invitation);
      }
    });

    it('persists invitation with email restriction', async () => {
      const invitation = createTestInvitation({
        email: 'specific@example.com',
      });

      const saveResult = await store.save(invitation);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(invitation.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.email).toBe('specific@example.com');
      }
    });

    it('persists accepted invitation', async () => {
      const acceptingUser = {
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: TEST_ORG.id,
        email: 'newuser@example.com',
        createdAt: '2024-01-02T00:00:00.000Z',
      };
      const userStore = await createSqliteUserStore(db);
      await userStore.save(acceptingUser);

      const invitation = createTestInvitation({
        acceptedAt: '2024-01-02T12:00:00.000Z',
        acceptedByUserId: acceptingUser.id,
      });

      const saveResult = await store.save(invitation);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(invitation.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.acceptedAt).toBe('2024-01-02T12:00:00.000Z');
        expect(findResult.value?.acceptedByUserId).toBe(acceptingUser.id);
      }
    });

    it('updates existing invitation on save', async () => {
      const invitation = createTestInvitation();
      await store.save(invitation);

      // Update the invitation (e.g., mark as accepted)
      const acceptingUser = {
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: TEST_ORG.id,
        email: 'newuser@example.com',
        createdAt: '2024-01-02T00:00:00.000Z',
      };
      const userStore = await createSqliteUserStore(db);
      await userStore.save(acceptingUser);

      const updatedInvitation = {
        ...invitation,
        acceptedAt: '2024-01-03T00:00:00.000Z',
        acceptedByUserId: acceptingUser.id,
      };
      await store.save(updatedInvitation);

      const findResult = await store.findById(invitation.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.acceptedAt).toBe('2024-01-03T00:00:00.000Z');
      }
    });
  });

  describe('findById', () => {
    it('returns invitation when found', async () => {
      const invitation = createTestInvitation({ code: 'FINDBYID' });
      await store.save(invitation);

      const result = await store.findById(invitation.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.code).toBe('FINDBYID');
      }
    });

    it('returns null when invitation not found', async () => {
      const result = await store.findById('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('findByCode', () => {
    it('returns invitation when found', async () => {
      const invitation = createTestInvitation({ code: 'MYCODE12' });
      await store.save(invitation);

      const result = await store.findByCode('MYCODE12');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.id).toBe(invitation.id);
      }
    });

    it('returns null when code not found', async () => {
      const result = await store.findByCode('NONEXIST');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('findPendingByOrganization', () => {
    it('returns empty array when no pending invitations', async () => {
      const result = await store.findPendingByOrganization(
        TEST_ORG.id,
        '2024-01-05T00:00:00.000Z'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns pending invitations only', async () => {
      // Pending invitation (not accepted, not expired)
      const pendingInvitation = createTestInvitation({
        id: '550e8400-e29b-41d4-a716-446655440010',
        code: 'PENDING1',
        expiresAt: '2024-01-10T00:00:00.000Z',
      });

      // Accepted invitation
      const acceptingUser = {
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: TEST_ORG.id,
        email: 'accepter@example.com',
        createdAt: '2024-01-02T00:00:00.000Z',
      };
      const userStore = await createSqliteUserStore(db);
      await userStore.save(acceptingUser);

      const acceptedInvitation = createTestInvitation({
        id: '550e8400-e29b-41d4-a716-446655440011',
        code: 'ACCEPTED',
        expiresAt: '2024-01-10T00:00:00.000Z',
        acceptedAt: '2024-01-03T00:00:00.000Z',
        acceptedByUserId: acceptingUser.id,
      });

      // Expired invitation
      const expiredInvitation = createTestInvitation({
        id: '550e8400-e29b-41d4-a716-446655440012',
        code: 'EXPIRED1',
        expiresAt: '2024-01-02T00:00:00.000Z', // Already expired
      });

      await store.save(pendingInvitation);
      await store.save(acceptedInvitation);
      await store.save(expiredInvitation);

      const result = await store.findPendingByOrganization(
        TEST_ORG.id,
        '2024-01-05T00:00:00.000Z' // Current time
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].code).toBe('PENDING1');
      }
    });

    it('only returns invitations for the specified organization', async () => {
      const otherOrg = {
        id: '550e8400-e29b-41d4-a716-446655440088',
        name: 'Other Organization',
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      const orgStore = await createSqliteOrganizationStore(db);
      await orgStore.save(otherOrg);

      const otherUser = {
        id: '550e8400-e29b-41d4-a716-446655440089',
        organizationId: otherOrg.id,
        email: 'other@example.com',
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      const userStore = await createSqliteUserStore(db);
      await userStore.save(otherUser);

      const invitation = createTestInvitation({
        organizationId: otherOrg.id,
        invitedByUserId: otherUser.id,
      });
      await store.save(invitation);

      const result = await store.findPendingByOrganization(
        TEST_ORG.id,
        '2024-01-05T00:00:00.000Z'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('findByOrganization', () => {
    it('returns all invitations for the organization', async () => {
      const acceptingUser = {
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: TEST_ORG.id,
        email: 'accepter@example.com',
        createdAt: '2024-01-02T00:00:00.000Z',
      };
      const userStore = await createSqliteUserStore(db);
      await userStore.save(acceptingUser);

      const invitation1 = createTestInvitation({
        id: '550e8400-e29b-41d4-a716-446655440020',
        code: 'FIRST123',
      });
      const invitation2 = createTestInvitation({
        id: '550e8400-e29b-41d4-a716-446655440021',
        code: 'SECOND12',
        acceptedAt: '2024-01-03T00:00:00.000Z',
        acceptedByUserId: acceptingUser.id,
      });

      await store.save(invitation1);
      await store.save(invitation2);

      const result = await store.findByOrganization(TEST_ORG.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('returns empty array when no invitations exist', async () => {
      const result = await store.findByOrganization(TEST_ORG.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });
});
