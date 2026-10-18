import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createSqliteSignupStore } from './sqlite-signup-store.js';
import { createSqliteInvitationStore } from './sqlite-invitation-store.js';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { createFakeSignupStore } from './fake-signup-store.js';
import { createFakeUserStore } from './fake-user-store.js';
import { createFakeOrganizationStore } from './fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from './fake-organization-membership-store.js';
import { createFakeInvitationStore } from './fake-invitation-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import type { CompleteSignupRecord } from '../domain/signup-store.js';

const invitedOrg = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Garden Club',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const invitation = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  code: 'GARDEN01',
  email: 'libby@example.com',
  organizationId: invitedOrg.id,
  invitedByUserId: null,
  role: 'owner' as const,
  expiresAt: '2024-06-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: '2024-06-15T12:00:00.000Z',
};

const record = (): CompleteSignupRecord => {
  const userId = '550e8400-e29b-41d4-a716-446655440010';
  const personalOrgId = '550e8400-e29b-41d4-a716-446655440011';
  return {
    user: {
      id: userId,
      email: 'libby@example.com',
      name: 'Libby',
      createdAt: '2024-06-15T12:00:00.000Z',
    },
    personalOrganization: {
      id: personalOrgId,
      name: 'Libby',
      createdAt: '2024-06-15T12:00:00.000Z',
    },
    personalMembership: {
      id: '550e8400-e29b-41d4-a716-446655440021',
      userId,
      organizationId: personalOrgId,
      role: 'owner',
      isPersonalOrg: true,
      joinedAt: '2024-06-15T12:00:00.000Z',
    },
    invitedMembership: {
      id: '550e8400-e29b-41d4-a716-446655440022',
      userId,
      organizationId: invitedOrg.id,
      role: 'owner',
      isPersonalOrg: false,
      joinedAt: '2024-06-15T12:00:00.000Z',
    },
    accepted: {
      ...invitation,
      acceptedAt: '2024-06-15T12:00:00.000Z',
      acceptedByUserId: userId,
    },
    event: {
      type: 'OwnerAssigned',
      id: '550e8400-e29b-41d4-a716-446655440098',
      organizationId: invitedOrg.id,
      userId,
      fromRole: null,
      previousOwnerUserId: null,
      actor: { kind: 'self', userId },
      occurredAt: '2024-06-15T12:00:00.000Z',
    },
  };
};

describe('sqlite signup store', () => {
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
    const orgStore = await createSqliteOrganizationStore(db);
    await orgStore.save(invitedOrg);
    const invitationStore = await createSqliteInvitationStore(db);
    await invitationStore.save(invitation);
  });

  it('writes user, orgs, memberships, accepted invite, and event in one batch', async () => {
    const store = createSqliteSignupStore(db);
    const result = await store.completeSignup(record());
    expect(result.isOk()).toBe(true);
    const events = await db.execute({
      sql: `SELECT type, actor_kind FROM membership_events`,
    });
    expect(events.rows[0]).toMatchObject({ type: 'OwnerAssigned', actor_kind: 'self' });
  });
});

describe('fake signup store', () => {
  it('leaves no user or accepted invite when persist fails', async () => {
    const userStore = createFakeUserStore();
    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [invitedOrg],
    });
    const membershipStore = createFakeOrganizationMembershipStore();
    const invitationStore = createFakeInvitationStore({
      initialInvitations: [invitation],
    });
    const store = createFakeSignupStore({
      userStore,
      organizationStore,
      membershipStore,
      invitationStore,
      shouldFailOnCompleteSignup: true,
    });

    const result = await store.completeSignup(record());
    expect(result.isErr()).toBe(true);
    const user = await userStore.findByNormalizedEmail('libby@example.com');
    expect(user.isOk() && user.value).toBeNull();
    const loaded = await invitationStore.findByCode(invitation.code);
    expect(loaded.isOk() && loaded.value?.acceptedAt).toBeNull();
  });
});
