import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createSqliteWorkspaceStore } from './sqlite-workspace-store.js';
import { createSqliteUserStore } from './sqlite-user-store.js';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { createSqliteInvitationStore } from './sqlite-invitation-store.js';
import { createFakeWorkspaceStore } from './fake-workspace-store.js';
import { createFakeOrganizationStore } from './fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from './fake-organization-membership-store.js';
import { createFakeInvitationStore } from './fake-invitation-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import type { Organization } from '../domain/organization.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { Invitation } from '../domain/invitation.js';
import type { User } from '../domain/user.js';
import type { OwnerAssigned } from '../domain/membership-events.js';

const org: Organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Garden Club',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const justin: User = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  email: 'justin@example.com',
  name: 'Justin',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const membership: OrganizationMembership = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: justin.id,
  organizationId: org.id,
  role: 'owner',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

const event: OwnerAssigned = {
  type: 'OwnerAssigned',
  id: '550e8400-e29b-41d4-a716-446655440098',
  organizationId: org.id,
  userId: justin.id,
  fromRole: null,
  previousOwnerUserId: null,
  actor: { kind: 'app-admin' },
  occurredAt: '2024-06-15T12:00:00.000Z',
};

const invitation: Invitation = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  code: 'GARDEN01',
  email: 'libby@example.com',
  organizationId: org.id,
  invitedByUserId: null,
  role: 'owner',
  expiresAt: '2024-06-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: '2024-06-15T12:00:00.000Z',
};

describe('sqlite workspace store', () => {
  let db: Database;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.execute({ sql: 'DELETE FROM membership_events' });
    await db.execute({ sql: 'DELETE FROM invitations' });
    await db.execute({ sql: 'DELETE FROM organization_memberships' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });
  });

  it('writes org, membership, and OwnerAssigned in one batch', async () => {
    const userStore = await createSqliteUserStore(db);
    await userStore.save(justin);
    const store = createSqliteWorkspaceStore(db);
    const result = await store.createWithOwner(org, membership, event);
    expect(result.isOk()).toBe(true);

    const orgStore = await createSqliteOrganizationStore(db);
    const loaded = await orgStore.findById(org.id);
    expect(loaded.isOk() && loaded.value?.name).toBe('Garden Club');
    const events = await db.execute({
      sql: `SELECT type FROM membership_events WHERE id = ?`,
      args: [event.id],
    });
    expect(events.rows[0]?.type).toBe('OwnerAssigned');
  });

  it('writes org and owner invite in one batch', async () => {
    const store = createSqliteWorkspaceStore(db);
    const result = await store.createWithOwnerInvite(org, invitation);
    expect(result.isOk()).toBe(true);
    const invitationStore = await createSqliteInvitationStore(db);
    const loaded = await invitationStore.findByCode(invitation.code);
    expect(loaded.isOk() && loaded.value?.role).toBe('owner');
  });

  it('returns one ownership row per workspace even with replaced and accepted owner invites', async () => {
    const userStore = await createSqliteUserStore(db);
    await userStore.save(justin);
    const store = createSqliteWorkspaceStore(db);
    await store.createWithOwner(org, membership, event);
    const invitationStore = await createSqliteInvitationStore(db);
    await invitationStore.save({
      ...invitation,
      id: '550e8400-e29b-41d4-a716-446655440031',
      code: 'REPLACED1',
      replacedAt: '2024-06-16T12:00:00.000Z',
    });
    await invitationStore.save({
      ...invitation,
      id: '550e8400-e29b-41d4-a716-446655440032',
      code: 'ACCEPTED1',
      acceptedAt: '2024-06-16T12:00:00.000Z',
      acceptedByUserId: justin.id,
    });
    const result = await store.listOwnershipRows();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({
        id: org.id,
        name: 'Garden Club',
        ownerUserId: justin.id,
        liveOwnerInviteEmail: null,
        liveOwnerInviteExpiresAt: null,
      });
      expect(Boolean(result.value[0]?.personal)).toBe(false);
    }
  });

  it('reads personal = true for a personal workspace', async () => {
    const userStore = await createSqliteUserStore(db);
    await userStore.save(justin);
    const store = createSqliteWorkspaceStore(db);
    const personalOrg: Organization = {
      id: '550e8400-e29b-41d4-a716-446655440099',
      name: "justin@example.com's Workspace",
      createdAt: '2024-01-02T00:00:00.000Z',
    };
    const personalMembership: OrganizationMembership = {
      id: '550e8400-e29b-41d4-a716-446655440021',
      userId: justin.id,
      organizationId: personalOrg.id,
      role: 'owner',
      isPersonalOrg: true,
      joinedAt: '2024-01-02T00:00:00.000Z',
    };
    await store.createWithOwner(personalOrg, personalMembership, {
      ...event,
      id: '550e8400-e29b-41d4-a716-446655440097',
      organizationId: personalOrg.id,
    });
    const result = await store.listOwnershipRows();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe(personalOrg.id);
      expect(result.value[0]?.ownerUserId).toBe(justin.id);
      expect(Boolean(result.value[0]?.personal)).toBe(true);
    }
  });

  it('returns a storage error when the list read fails', async () => {
    const closed = await createTestDatabase();
    await closed.close();
    const store = createSqliteWorkspaceStore(closed);
    const result = await store.listOwnershipRows();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('WORKSPACE_STORAGE_ERROR');
    }
  });
});

describe('fake workspace store', () => {
  it('writes nothing when create workspace is forced to fail', async () => {
    const organizationStore = createFakeOrganizationStore();
    const membershipStore = createFakeOrganizationMembershipStore();
    const invitationStore = createFakeInvitationStore();
    const store = createFakeWorkspaceStore({
      organizationStore,
      membershipStore,
      invitationStore,
      shouldFailOnCreateWorkspace: true,
    });

    const assigned = await store.createWithOwner(org, membership, event);
    expect(assigned.isErr()).toBe(true);
    const loaded = await organizationStore.findById(org.id);
    expect(loaded.isOk() && loaded.value).toBeNull();

    const invited = await store.createWithOwnerInvite(org, invitation);
    expect(invited.isErr()).toBe(true);
    const invite = await invitationStore.findByCode(invitation.code);
    expect(invite.isOk() && invite.value).toBeNull();
  });

  it('returns one ownership row per workspace even with replaced and accepted owner invites', async () => {
    const organizationStore = createFakeOrganizationStore();
    const membershipStore = createFakeOrganizationMembershipStore();
    const invitationStore = createFakeInvitationStore();
    const store = createFakeWorkspaceStore({
      organizationStore,
      membershipStore,
      invitationStore,
    });
    await store.createWithOwner(org, membership, event);
    await invitationStore.save({
      ...invitation,
      id: '550e8400-e29b-41d4-a716-446655440031',
      code: 'REPLACED1',
      replacedAt: '2024-06-16T12:00:00.000Z',
    });
    await invitationStore.save({
      ...invitation,
      id: '550e8400-e29b-41d4-a716-446655440032',
      code: 'ACCEPTED1',
      acceptedAt: '2024-06-16T12:00:00.000Z',
      acceptedByUserId: justin.id,
    });
    const result = await store.listOwnershipRows();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({
        id: org.id,
        name: 'Garden Club',
        ownerUserId: justin.id,
        personal: false,
        liveOwnerInviteEmail: null,
        liveOwnerInviteExpiresAt: null,
      });
    }
  });

  it('reads personal = true for a personal workspace', async () => {
    const organizationStore = createFakeOrganizationStore();
    const membershipStore = createFakeOrganizationMembershipStore();
    const invitationStore = createFakeInvitationStore();
    const store = createFakeWorkspaceStore({
      organizationStore,
      membershipStore,
      invitationStore,
    });
    const personalOrg: Organization = {
      id: '550e8400-e29b-41d4-a716-446655440099',
      name: "justin@example.com's Workspace",
      createdAt: '2024-01-02T00:00:00.000Z',
    };
    const personalMembership: OrganizationMembership = {
      id: '550e8400-e29b-41d4-a716-446655440021',
      userId: justin.id,
      organizationId: personalOrg.id,
      role: 'owner',
      isPersonalOrg: true,
      joinedAt: '2024-01-02T00:00:00.000Z',
    };
    await store.createWithOwner(personalOrg, personalMembership, {
      ...event,
      id: '550e8400-e29b-41d4-a716-446655440097',
      organizationId: personalOrg.id,
    });
    const result = await store.listOwnershipRows();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]).toMatchObject({
        id: personalOrg.id,
        personal: true,
        ownerUserId: justin.id,
      });
    }
  });

  it('returns a storage error when listing is forced to fail', async () => {
    const store = createFakeWorkspaceStore({
      organizationStore: createFakeOrganizationStore(),
      membershipStore: createFakeOrganizationMembershipStore(),
      invitationStore: createFakeInvitationStore(),
      shouldFailOnListOwnershipRows: true,
    });
    const result = await store.listOwnershipRows();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('WORKSPACE_STORAGE_ERROR');
    }
  });
});
