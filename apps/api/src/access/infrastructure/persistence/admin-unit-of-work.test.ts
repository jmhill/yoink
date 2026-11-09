import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeClock, createFakeIdGenerator, createFakePasswordHasher } from '@yoink/infrastructure';
import type { Client } from '@libsql/client';
import { openDatabase } from '../../../platform/database/database.js';
import { migrations } from '../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../platform/database/migrator.js';
import type { Database } from '../../../platform/database/types.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
} from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { createAdminService } from '../../application/handle-admin.js';
import type { AdminPlan } from '../../domain/admin-plan.js';
import { decideChangeMemberRole } from '../../domain/decide-change-member-role.js';
import { planCreateAdminMember, decideCreateAdminMember } from '../../domain/decide-create-admin-member.js';
import { decideSetOwner } from '../../domain/decide-set-owner.js';
import type { Invitation } from '../../domain/invitation.js';
import type { OrganizationMembership } from '../../domain/organization-membership.js';
import type { Organization } from '../../domain/organization.js';
import type { User } from '../../domain/user.js';
import { createSqliteInvitationStore } from '../sqlite-invitation-store.js';
import { createSqliteOrganizationMembershipStore } from '../sqlite-organization-membership-store.js';
import { createSqliteOrganizationStore } from '../sqlite-organization-store.js';
import { createSqliteTokenStore } from '../sqlite-token-store.js';
import { createSqliteUserStore } from '../sqlite-user-store.js';
import { accessSqlParticipant } from './access-sql-participant.js';
import { compileAdminPlan } from './compile-admin.js';

const NOW = '2024-06-15T12:00:00.000Z';
const ORG = '550e8400-e29b-41d4-a716-446655440001';
const USER = '550e8400-e29b-41d4-a716-446655440010';
const OTHER = '550e8400-e29b-41d4-a716-446655440011';
const MEMBERSHIP = '550e8400-e29b-41d4-a716-446655440021';
const OTHER_MEMBERSHIP = '550e8400-e29b-41d4-a716-446655440022';
const INVITE = '550e8400-e29b-41d4-a716-446655440030';
const EVENT = '550e8400-e29b-41d4-a716-446655440098';

const organization: Organization = {
  id: ORG,
  name: 'Polly UX',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const user = (id: string, email: string): User => ({
  id,
  email,
  createdAt: NOW,
});

const membership = (
  id: string,
  userId: string,
  role: OrganizationMembership['role']
): OrganizationMembership => ({
  id,
  userId,
  organizationId: ORG,
  role,
  isPersonalOrg: false,
  joinedAt: NOW,
});

const invitation: Invitation = {
  id: INVITE,
  code: 'OWNERINV',
  email: 'next@example.com',
  organizationId: ORG,
  invitedByUserId: null,
  role: 'owner',
  expiresAt: '2024-06-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: NOW,
};

describe('admin unit of work', () => {
  let db: Database;
  let client: Client;
  let directory: string;

  const count = async (sql: string, args: readonly unknown[] = []): Promise<number> => {
    const result = await db.execute({ sql, args: [...args] });
    return Number(result.rows[0]?.n ?? 0);
  };

  const commit = (plan: AdminPlan) =>
    createSqliteUnitOfWork({
      client: libsqlWriteClient(client),
      participants: [accessSqlParticipant],
    }).commit([{ result: null, events: [], step: { owner: 'access', plan } }]);

  const clear = async () => {
    await db.execute({ sql: 'DELETE FROM api_tokens' });
    await db.execute({ sql: 'DELETE FROM membership_events' });
    await db.execute({ sql: 'DELETE FROM invitations' });
    await db.execute({ sql: 'DELETE FROM organization_memberships' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });
  };

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'yoink-admin-uow-'));
    const opened = openDatabase({ type: 'file', path: join(directory, 'admin.db') });
    db = opened.database;
    client = opened.client;
    await runMigrations(db, migrations);
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });
  });

  afterAll(async () => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clear();
  });

  it('guards only the user-name update', () => {
    const decision = decideCreateAdminMember({
      command: { organizationId: ORG, email: 'ada@example.com' },
      organization,
      userId: USER,
    });
    expect(decision.isOk()).toBe(true);
    if (!decision.isOk()) return;
    const member = compileAdminPlan(
      planCreateAdminMember({
        decision: decision.value,
        userId: USER,
        membershipId: MEMBERSHIP,
        organizationId: ORG,
        now: NOW,
      })
    );
    expect(member[0]?.guard).toBe(false);
    expect(member[0]?.sql).not.toContain('WHERE NOT EXISTS');
    expect(member[1]?.sql).not.toContain('WHERE EXISTS');

    const rename = compileAdminPlan({ kind: 'rename-user', userId: USER, name: 'Ada' });
    expect(rename).toHaveLength(1);
    expect(rename[0]?.guard).toBe(true);
  });

  it('rolls back a create-member batch when the membership cannot reference the workspace', async () => {
    const decision = decideCreateAdminMember({
      command: { organizationId: ORG, email: 'ada@example.com' },
      organization,
      userId: USER,
    });
    expect(decision.isOk()).toBe(true);
    if (!decision.isOk()) return;
    const result = await commit(
      planCreateAdminMember({
        decision: decision.value,
        userId: USER,
        membershipId: MEMBERSHIP,
        organizationId: ORG,
        now: NOW,
      })
    );

    expect(result.isErr() && result.error.kind).toBe('Storage');
    if (result.isErr() && result.error.kind === 'Storage') {
      expect(result.error.owner).toBe('access');
      expect(result.error.owners).toEqual(['access']);
    }
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(0);
  });

  it('returns Conflict for a missing user and still accepts the next commit', async () => {
    const missed = await commit({ kind: 'rename-user', userId: USER, name: 'Ada' });
    expect(missed.isErr() && missed.error).toMatchObject({
      kind: 'Conflict',
      owner: 'access',
      reason: 'guard-miss',
    });
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(0);

    const created = await commit({
      kind: 'create-organization',
      organization,
    });
    expect(created.isOk()).toBe(true);
    expect(await count('SELECT COUNT(*) AS n FROM organizations WHERE id = ?', [ORG])).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(0);
  });

  it('demotes the old owner, promotes the member, and replaces the live invite', async () => {
    const orgStore = await createSqliteOrganizationStore(db);
    const userStore = await createSqliteUserStore(db);
    const membershipStore = await createSqliteOrganizationMembershipStore(db);
    const invitationStore = await createSqliteInvitationStore(db);
    expect((await orgStore.save(organization)).isOk()).toBe(true);
    expect((await userStore.save(user(USER, 'owner@example.com'))).isOk()).toBe(true);
    expect((await userStore.save(user(OTHER, 'next@example.com'))).isOk()).toBe(true);
    expect((await membershipStore.save(membership(MEMBERSHIP, USER, 'owner'))).isOk()).toBe(true);
    expect((await membershipStore.save(membership(OTHER_MEMBERSHIP, OTHER, 'member'))).isOk()).toBe(true);
    expect((await invitationStore.save(invitation)).isOk()).toBe(true);

    const members = await membershipStore.findByOrganizationId(ORG);
    expect(members.isOk()).toBe(true);
    if (!members.isOk()) return;
    const decision = decideSetOwner({
      command: { organizationId: ORG, userId: OTHER },
      members: members.value,
      targetUser: user(OTHER, 'next@example.com'),
      pendingOwnerInvitation: invitation,
      eventId: EVENT,
      now: NOW,
    });
    expect(decision.isOk()).toBe(true);
    if (!decision.isOk()) return;

    const result = await commit({
      kind: 'set-owner',
      transfer: decision.value.plan,
      event: decision.value.event,
      replaced: decision.value.replaced,
    });
    expect(result.isOk()).toBe(true);

    const roles = await db.execute({
      sql: `SELECT user_id, role FROM organization_memberships WHERE organization_id = ? ORDER BY user_id`,
      args: [ORG],
    });
    expect(roles.rows.map((row) => ({ user_id: row.user_id, role: row.role }))).toEqual([
      { user_id: USER, role: 'admin' },
      { user_id: OTHER, role: 'owner' },
    ]);
    expect(
      await count(`SELECT COUNT(*) AS n FROM membership_events WHERE type = 'OwnerAssigned'`)
    ).toBe(1);
    const replaced = await db.execute({
      sql: `SELECT replaced_at FROM invitations WHERE id = ?`,
      args: [INVITE],
    });
    expect(replaced.rows[0]?.replaced_at).toBe(NOW);
    expect(await count(`SELECT COUNT(*) AS n FROM organization_memberships WHERE role = 'owner'`)).toBe(1);
  });

  it('commits workspace, member, and token writes from the handler', async () => {
    const orgStore = await createSqliteOrganizationStore(db);
    const userStore = await createSqliteUserStore(db);
    const membershipStore = await createSqliteOrganizationMembershipStore(db);
    const invitationStore = await createSqliteInvitationStore(db);
    const tokenStore = await createSqliteTokenStore(db);
    const service = createAdminService({
      organizationStore: orgStore,
      organizationMembershipStore: membershipStore,
      userStore,
      invitationStore,
      tokenStore,
      projectStore: {
        updateCreatedAt: () => {
          throw new Error('project writes stay on the project store');
        },
        findById: () => {
          throw new Error('project reads stay on the project store');
        },
      } as never,
      clock: createFakeClock(new Date(NOW)),
      idGenerator: createFakeIdGenerator(),
      passwordHasher: createFakePasswordHasher(),
      unitOfWork: createSqliteUnitOfWork({
        client: libsqlWriteClient(client),
        participants: [accessSqlParticipant],
      }),
    });

    const created = await service.createOrganization('Polly UX');
    expect(created.isOk()).toBe(true);
    if (!created.isOk()) return;
    const member = await service.createUser({
      organizationId: created.value.id,
      email: 'ada@example.com',
    });
    expect(member.isOk()).toBe(true);
    if (!member.isOk()) return;
    const named = await service.updateUser(member.value.id, 'Ada');
    expect(named.isOk() && named.value.name).toBe('Ada');
    const owner = await service.setOrganizationOwner({
      organizationId: created.value.id,
      userId: member.value.id,
    });
    expect(owner.isOk() && owner.value.role).toBe('owner');
    const renamed = await service.renameOrganization(created.value.id, 'Renamed');
    expect(renamed.isOk() && renamed.value?.name).toBe('Renamed');
    expect(renamed.isOk() && renamed.value?.createdAt).toBe(created.value.createdAt);

    const token = await service.createToken({
      organizationId: created.value.id,
      userId: member.value.id,
      name: '  Lane  ',
    });
    expect(token.isOk()).toBe(true);
    if (!token.isOk()) return;
    const stored = await db.execute({
      sql: `SELECT token_hash, name FROM api_tokens WHERE id = ?`,
      args: [token.value.token.id],
    });
    const secret = token.value.rawToken.split(':')[1];
    expect(stored.rows[0]?.name).toBe('Lane');
    expect(stored.rows[0]?.token_hash).toBe(`fake-hash:${secret}`);
    expect(stored.rows[0]?.token_hash).not.toBe(token.value.rawToken);
    expect(token.value.token).not.toHaveProperty('tokenHash');

    const revoked = await service.revokeToken(token.value.token.id);
    expect(revoked.isOk()).toBe(true);
    expect(
      await count(`SELECT COUNT(*) AS n FROM api_tokens WHERE id = ? AND revoked_at IS NOT NULL`, [
        token.value.token.id,
      ])
    ).toBe(1);

    const duplicate = await service.createUser({
      organizationId: created.value.id,
      email: 'ada@example.com',
    });
    expect(duplicate.isErr() && duplicate.error.type).toBe('USER_STORAGE_ERROR');
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', ['ada@example.com'])).toBe(1);

    const other = await service.createUser({
      organizationId: created.value.id,
      email: 'bea@example.com',
      role: 'member',
    });
    expect(other.isOk()).toBe(true);
    if (!other.isOk()) return;
    const members = await membershipStore.findByOrganizationId(created.value.id);
    expect(members.isOk()).toBe(true);
    if (!members.isOk()) return;
    const decision = decideChangeMemberRole({
      command: {
        organizationId: created.value.id,
        userId: other.value.id,
        newRole: 'admin',
        by: { kind: 'app-admin' },
      },
      members: members.value,
      targetKind: 'human',
      eventId: EVENT,
      now: NOW,
    });
    expect(decision.isOk() && decision.value.kind).toBe('changed');

    const switched = await service.changeMemberRole({
      organizationId: created.value.id,
      userId: other.value.id,
      role: 'admin',
    });
    expect(switched.isOk() && switched.value.role).toBe('admin');
    expect(
      await count(`SELECT COUNT(*) AS n FROM membership_events WHERE type = 'MemberRoleChanged'`)
    ).toBe(1);
  });
});
