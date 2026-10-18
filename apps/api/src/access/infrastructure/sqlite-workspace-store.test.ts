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
});
