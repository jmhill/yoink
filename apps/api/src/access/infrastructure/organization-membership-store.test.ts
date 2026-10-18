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

const adminUser: User = {
  id: '550e8400-e29b-41d4-a716-446655440012',
  email: 'admin@example.com',
  name: 'Polly',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const adminMembership: OrganizationMembership = {
  id: '550e8400-e29b-41d4-a716-446655440022',
  userId: adminUser.id,
  organizationId: org.id,
  role: 'admin',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

const roleChangedEvent = {
  type: 'MemberRoleChanged' as const,
  id: '550e8400-e29b-41d4-a716-446655440091',
  organizationId: org.id,
  userId: memberUser.id,
  fromRole: 'member' as const,
  toRole: 'admin' as const,
  actor: { kind: 'member' as const, userId: adminUser.id },
  occurredAt: '2024-06-15T12:00:00.000Z',
};

const memberRemovedEvent = {
  type: 'MemberRemoved' as const,
  id: '550e8400-e29b-41d4-a716-446655440092',
  organizationId: org.id,
  userId: memberUser.id,
  role: 'member' as const,
  actorUserId: adminUser.id,
  occurredAt: '2024-06-15T12:00:00.000Z',
};

const memberLeftEvent = {
  type: 'MemberLeft' as const,
  id: '550e8400-e29b-41d4-a716-446655440093',
  organizationId: org.id,
  userId: adminUser.id,
  role: 'admin' as const,
  occurredAt: '2024-06-15T12:00:00.000Z',
};

describe('organization membership store changeMemberRole and removeMember', () => {
  describe('fake', () => {
    it('writes the role change and event in one save', async () => {
      const store = createFakeOrganizationMembershipStore({
        initialMemberships: [ownerMembership, adminMembership, memberMembership],
      });
      const result = await store.changeMemberRole(
        { ...memberMembership, role: 'admin' },
        roleChangedEvent
      );
      expect(result.isOk()).toBe(true);
      const saved = await store.findById(memberMembership.id);
      expect(saved.isOk() && saved.value?.role).toBe('admin');
      expect(store.recordedEvents()).toEqual([roleChangedEvent]);
    });

    it('writes MemberRemoved in the same save as the delete', async () => {
      const store = createFakeOrganizationMembershipStore({
        initialMemberships: [ownerMembership, adminMembership, memberMembership],
      });
      const result = await store.removeMember(memberMembership.id, memberRemovedEvent);
      expect(result.isOk()).toBe(true);
      const gone = await store.findById(memberMembership.id);
      expect(gone.isOk() && gone.value).toBeNull();
      expect(store.recordedEvents()).toEqual([memberRemovedEvent]);
    });

    it('writes MemberLeft in the same save as the delete', async () => {
      const store = createFakeOrganizationMembershipStore({
        initialMemberships: [ownerMembership, adminMembership, memberMembership],
      });
      const result = await store.removeMember(adminMembership.id, memberLeftEvent);
      expect(result.isOk()).toBe(true);
      const gone = await store.findById(adminMembership.id);
      expect(gone.isOk() && gone.value).toBeNull();
      expect(store.recordedEvents()).toEqual([memberLeftEvent]);
    });

    it('leaves memberships unchanged when changeMemberRole fails', async () => {
      const store = createFakeOrganizationMembershipStore({
        initialMemberships: [ownerMembership, adminMembership, memberMembership],
        shouldFailOnChangeMemberRole: true,
      });
      const result = await store.changeMemberRole(
        { ...memberMembership, role: 'admin' },
        roleChangedEvent
      );
      expect(result.isErr()).toBe(true);
      const saved = await store.findById(memberMembership.id);
      expect(saved.isOk() && saved.value?.role).toBe('member');
      expect(store.recordedEvents()).toHaveLength(0);
    });

    it('leaves memberships unchanged when removeMember fails', async () => {
      const store = createFakeOrganizationMembershipStore({
        initialMemberships: [ownerMembership, adminMembership, memberMembership],
        shouldFailOnRemoveMember: true,
      });
      const result = await store.removeMember(memberMembership.id, memberRemovedEvent);
      expect(result.isErr()).toBe(true);
      const saved = await store.findById(memberMembership.id);
      expect(saved.isOk() && saved.value?.role).toBe('member');
      expect(store.recordedEvents()).toHaveLength(0);
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
      await userStore.save(adminUser);
      store = await createSqliteOrganizationMembershipStore(db);
      await store.save(ownerMembership);
      await store.save(memberMembership);
      await store.save(adminMembership);
    });

    it('writes the role change and event in one save', async () => {
      const result = await store.changeMemberRole(
        { ...memberMembership, role: 'admin' },
        roleChangedEvent
      );
      expect(result.isOk()).toBe(true);
      const saved = await store.findById(memberMembership.id);
      expect(saved.isOk() && saved.value?.role).toBe('admin');
      const rows = await db.execute({
        sql: `SELECT type, user_id, from_role, to_role, actor_kind, actor_user_id FROM membership_events WHERE id = ?`,
        args: [roleChangedEvent.id],
      });
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.type).toBe('MemberRoleChanged');
      expect(rows.rows[0]?.user_id).toBe(memberUser.id);
      expect(rows.rows[0]?.from_role).toBe('member');
      expect(rows.rows[0]?.to_role).toBe('admin');
      expect(rows.rows[0]?.actor_kind).toBe('member');
      expect(rows.rows[0]?.actor_user_id).toBe(adminUser.id);
    });

    it('writes MemberRemoved in the same save as the delete', async () => {
      const result = await store.removeMember(memberMembership.id, memberRemovedEvent);
      expect(result.isOk()).toBe(true);
      const gone = await store.findById(memberMembership.id);
      expect(gone.isOk() && gone.value).toBeNull();
      const rows = await db.execute({
        sql: `SELECT type, user_id, from_role, actor_kind, actor_user_id FROM membership_events WHERE id = ?`,
        args: [memberRemovedEvent.id],
      });
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.type).toBe('MemberRemoved');
      expect(rows.rows[0]?.from_role).toBe('member');
      expect(rows.rows[0]?.actor_kind).toBe('member');
    });

    it('writes MemberLeft in the same save as the delete', async () => {
      const result = await store.removeMember(adminMembership.id, memberLeftEvent);
      expect(result.isOk()).toBe(true);
      const gone = await store.findById(adminMembership.id);
      expect(gone.isOk() && gone.value).toBeNull();
      const rows = await db.execute({
        sql: `SELECT type, actor_kind FROM membership_events WHERE id = ?`,
        args: [memberLeftEvent.id],
      });
      expect(rows.rows[0]?.type).toBe('MemberLeft');
      expect(rows.rows[0]?.actor_kind).toBe('self');
    });

    it('leaves memberships unchanged when the role-change batch fails', async () => {
      await store.changeMemberRole({ ...memberMembership, role: 'admin' }, roleChangedEvent);
      const result = await store.changeMemberRole(
        { ...memberMembership, role: 'member' },
        { ...roleChangedEvent, fromRole: 'admin', toRole: 'member' }
      );
      expect(result.isErr()).toBe(true);
      const saved = await store.findById(memberMembership.id);
      expect(saved.isOk() && saved.value?.role).toBe('admin');
      const rows = await db.execute({
        sql: `SELECT to_role FROM membership_events WHERE id = ?`,
        args: [roleChangedEvent.id],
      });
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.to_role).toBe('admin');
    });

    it('leaves memberships unchanged when the remove batch fails', async () => {
      await store.changeMemberRole({ ...memberMembership, role: 'admin' }, roleChangedEvent);
      const result = await store.removeMember(memberMembership.id, {
        ...memberRemovedEvent,
        id: roleChangedEvent.id,
      });
      expect(result.isErr()).toBe(true);
      const saved = await store.findById(memberMembership.id);
      expect(saved.isOk() && saved.value?.role).toBe('admin');
      const events = await db.execute({
        sql: `SELECT type FROM membership_events`,
      });
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0]?.type).toBe('MemberRoleChanged');
    });
  });
});

