import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createFakeOrganizationMembershipStore } from './fake-organization-membership-store.js';
import { createSqliteOrganizationMembershipStore } from './sqlite-organization-membership-store.js';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { createSqliteUserStore } from './sqlite-user-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { User } from '../domain/user.js';
import type { Organization } from '../domain/organization.js';

const org: Organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Polly UX',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const ownerUser: User = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  email: 'owner@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const memberUser: User = {
  id: '550e8400-e29b-41d4-a716-446655440011',
  email: 'member@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const ownerMembership: OrganizationMembership = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: ownerUser.id,
  organizationId: org.id,
  role: 'owner',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

const memberMembership: OrganizationMembership = {
  id: '550e8400-e29b-41d4-a716-446655440021',
  userId: memberUser.id,
  organizationId: org.id,
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

const describeSetOwner = (
  name: string,
  createStore: () => Promise<OrganizationMembershipStore>
) => {
  describe(name, () => {
    let store: OrganizationMembershipStore;

    beforeEach(async () => {
      store = await createStore();
      await store.save(ownerMembership);
      await store.save(memberMembership);
    });

    it('sets the owner in one save and demotes the old owner to admin', async () => {
      const result = await store.setOwner({
        demote: { ...ownerMembership, role: 'admin' },
        promote: { ...memberMembership, role: 'owner' },
      });
      expect(result.isOk()).toBe(true);

      const oldOwner = await store.findById(ownerMembership.id);
      const newOwner = await store.findById(memberMembership.id);
      expect(oldOwner.isOk() && oldOwner.value?.role).toBe('admin');
      expect(newOwner.isOk() && newOwner.value?.role).toBe('owner');
    });

    it('transfers ownership in one save and records the event', async () => {
      const event = {
        type: 'OwnershipTransferred' as const,
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: org.id,
        fromUserId: ownerUser.id,
        toUserId: memberUser.id,
        actorUserId: ownerUser.id,
        occurredAt: '2024-06-15T12:00:00.000Z',
      };
      const result = await store.transferOwnership(
        {
          demote: { ...ownerMembership, role: 'admin' },
          promote: { ...memberMembership, role: 'owner' },
        },
        event
      );
      expect(result.isOk()).toBe(true);

      const oldOwner = await store.findById(ownerMembership.id);
      const newOwner = await store.findById(memberMembership.id);
      expect(oldOwner.isOk() && oldOwner.value?.role).toBe('admin');
      expect(newOwner.isOk() && newOwner.value?.role).toBe('owner');
    });
  });
};

describe('organization membership store setOwner', () => {
  describeSetOwner('fake', async () =>
    createFakeOrganizationMembershipStore({
      initialMemberships: [],
    })
  );

  describe('fake failure leaves the old owner', () => {
    it('does not demote the old owner when transferOwnership fails', async () => {
      const store = createFakeOrganizationMembershipStore({
        initialMemberships: [ownerMembership, memberMembership],
        shouldFailOnTransferOwnership: true,
      });

      const result = await store.transferOwnership(
        {
          demote: { ...ownerMembership, role: 'admin' },
          promote: { ...memberMembership, role: 'owner' },
        },
        {
          type: 'OwnershipTransferred',
          id: '550e8400-e29b-41d4-a716-446655440099',
          organizationId: org.id,
          fromUserId: ownerUser.id,
          toUserId: memberUser.id,
          actorUserId: ownerUser.id,
          occurredAt: '2024-06-15T12:00:00.000Z',
        }
      );
      expect(result.isErr()).toBe(true);
      expect(store.recordedEvents()).toHaveLength(0);

      const oldOwner = await store.findById(ownerMembership.id);
      expect(oldOwner.isOk() && oldOwner.value?.role).toBe('owner');
    });

    it('does not demote the old owner when the save fails', async () => {
      const store = createFakeOrganizationMembershipStore({
        initialMemberships: [ownerMembership, memberMembership],
        shouldFailOnSetOwner: true,
      });

      const result = await store.setOwner({
        demote: { ...ownerMembership, role: 'admin' },
        promote: { ...memberMembership, role: 'owner' },
      });
      expect(result.isErr()).toBe(true);

      const oldOwner = await store.findById(ownerMembership.id);
      expect(oldOwner.isOk() && oldOwner.value?.role).toBe('owner');
    });
  });

  describe('sqlite', () => {
    let db: Database;
    let store: OrganizationMembershipStore;

    beforeAll(async () => {
      db = await createTestDatabase();
    });

    afterAll(async () => {
      await db.close();
    });

    beforeEach(async () => {
      await db.execute({ sql: 'DELETE FROM membership_events' });
      await db.execute({ sql: 'DELETE FROM organization_memberships' });
      await db.execute({ sql: 'DELETE FROM api_tokens' });
      await db.execute({ sql: 'DELETE FROM users' });
      await db.execute({ sql: 'DELETE FROM organizations' });

      const orgStore = await createSqliteOrganizationStore(db);
      await orgStore.save(org);
      const userStore = await createSqliteUserStore(db);
      await userStore.save(ownerUser);
      await userStore.save(memberUser);
      store = await createSqliteOrganizationMembershipStore(db);
      await store.save(ownerMembership);
      await store.save(memberMembership);
    });

    it('sets the owner in one save and demotes the old owner to admin', async () => {
      const result = await store.setOwner({
        demote: { ...ownerMembership, role: 'admin' },
        promote: { ...memberMembership, role: 'owner' },
      });
      expect(result.isOk()).toBe(true);

      const oldOwner = await store.findById(ownerMembership.id);
      const newOwner = await store.findById(memberMembership.id);
      expect(oldOwner.isOk() && oldOwner.value?.role).toBe('admin');
      expect(newOwner.isOk() && newOwner.value?.role).toBe('owner');
    });

    it('rejects a direct second-owner insert', async () => {
      const result = await store.save({
        ...memberMembership,
        role: 'owner',
      });
      expect(result.isErr()).toBe(true);
      const stillOwner = await store.findById(ownerMembership.id);
      expect(stillOwner.isOk() && stillOwner.value?.role).toBe('owner');
    });

    it('leaves the old owner when the batch cannot promote a second owner', async () => {
      const result = await store.setOwner({
        demote: null,
        promote: { ...memberMembership, role: 'owner' },
      });
      expect(result.isErr()).toBe(true);
      const stillOwner = await store.findById(ownerMembership.id);
      expect(stillOwner.isOk() && stillOwner.value?.role).toBe('owner');
      const stillMember = await store.findById(memberMembership.id);
      expect(stillMember.isOk() && stillMember.value?.role).toBe('member');
    });

    it('writes the OwnershipTransferred event in the same batch', async () => {
      const event = {
        type: 'OwnershipTransferred' as const,
        id: '550e8400-e29b-41d4-a716-446655440099',
        organizationId: org.id,
        fromUserId: ownerUser.id,
        toUserId: memberUser.id,
        actorUserId: ownerUser.id,
        occurredAt: '2024-06-15T12:00:00.000Z',
      };
      const result = await store.transferOwnership(
        {
          demote: { ...ownerMembership, role: 'admin' },
          promote: { ...memberMembership, role: 'owner' },
        },
        event
      );
      expect(result.isOk()).toBe(true);
      const rows = await db.execute({
        sql: `SELECT type, from_user_id, to_user_id, actor_user_id FROM membership_events WHERE id = ?`,
        args: [event.id],
      });
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.type).toBe('OwnershipTransferred');
      expect(rows.rows[0]?.from_user_id).toBe(ownerUser.id);
      expect(rows.rows[0]?.to_user_id).toBe(memberUser.id);
      expect(rows.rows[0]?.actor_user_id).toBe(ownerUser.id);
    });

    it('leaves the old owner when transferOwnership cannot promote a second owner', async () => {
      const result = await store.transferOwnership(
        {
          demote: null,
          promote: { ...memberMembership, role: 'owner' },
        },
        {
          type: 'OwnershipTransferred',
          id: '550e8400-e29b-41d4-a716-446655440098',
          organizationId: org.id,
          fromUserId: ownerUser.id,
          toUserId: memberUser.id,
          actorUserId: ownerUser.id,
          occurredAt: '2024-06-15T12:00:00.000Z',
        }
      );
      expect(result.isErr()).toBe(true);
      const stillOwner = await store.findById(ownerMembership.id);
      expect(stillOwner.isOk() && stillOwner.value?.role).toBe('owner');
      const stillMember = await store.findById(memberMembership.id);
      expect(stillMember.isOk() && stillMember.value?.role).toBe('member');
      const rows = await db.execute({
        sql: `SELECT id FROM membership_events`,
      });
      expect(rows.rows).toHaveLength(0);
    });
  });
});
