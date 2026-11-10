import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { okAsync } from 'neverthrow';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Client } from '@libsql/client';
import { openDatabase } from '../../../platform/database/database.js';
import { migrations } from '../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../platform/database/migrator.js';
import type { Database } from '../../../platform/database/types.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
} from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { createMembershipService } from '../../application/handle-membership.js';
import { planAddMember } from '../../domain/decide-add-member.js';
import type { MembershipPlan } from '../../domain/membership-plan.js';
import type { OrganizationMembership } from '../../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../../domain/organization-membership-store.js';
import type { Organization } from '../../domain/organization.js';
import type { OrganizationStore } from '../../domain/organization-store.js';
import type { User } from '../../domain/user.js';
import type { UserService } from '../../domain/user-service.js';
import { accessSqlParticipant } from './access-sql-participant.js';
import { compileMembershipPlan } from './compile-membership.js';

const NOW = '2024-01-15T10:00:00.000Z';
const ORG = '550e8400-e29b-41d4-a716-446655440001';
const USER = '550e8400-e29b-41d4-a716-446655440010';
const ADMIN = '550e8400-e29b-41d4-a716-446655440011';
const MEMBERSHIP = '550e8400-e29b-41d4-a716-446655440020';
const ADMIN_MEMBERSHIP = '550e8400-e29b-41d4-a716-446655440021';

const organization: Organization = {
  id: ORG,
  name: 'Team Org',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const user: User = {
  id: USER,
  email: 'member@example.com',
  name: 'Mina',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const admin: User = {
  id: ADMIN,
  email: 'admin@example.com',
  name: 'Ada',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const memberMembership: OrganizationMembership = {
  id: MEMBERSHIP,
  userId: USER,
  organizationId: ORG,
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

const adminMembership: OrganizationMembership = {
  id: ADMIN_MEMBERSHIP,
  userId: ADMIN,
  organizationId: ORG,
  role: 'owner',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

const personalMembership: OrganizationMembership = {
  ...memberMembership,
  role: 'owner',
  isPersonalOrg: true,
};

const addPlan = (): MembershipPlan =>
  planAddMember({
    decision: {
      userId: USER,
      organizationId: ORG,
      role: 'member',
      isPersonalOrg: false,
    },
    membershipId: MEMBERSHIP,
    now: NOW,
  });

describe('membership unit of work', () => {
  let db: Database;
  let client: Client;
  let directory: string;

  const count = async (sql: string, args: readonly unknown[] = []): Promise<number> => {
    const result = await db.execute({ sql, args: [...args] });
    return Number(result.rows[0]?.n ?? 0);
  };

  const commit = (plan: MembershipPlan) =>
    createSqliteUnitOfWork({
      client: libsqlWriteClient(client),
      participants: [accessSqlParticipant],
    }).commit([{ result: null, events: [], step: { owner: 'access', plan } }]);

  const insertOrganization = () =>
    db.execute({
      sql: 'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)',
      args: [organization.id, organization.name, organization.createdAt],
    });

  const insertUser = (row: User) =>
    db.execute({
      sql: 'INSERT INTO users (id, email, name, kind, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [row.id, row.email, row.name ?? null, row.kind ?? 'human', row.createdAt],
    });

  const insertMembership = (membership: OrganizationMembership) =>
    db.execute({
      sql: `INSERT INTO organization_memberships (
        id, user_id, organization_id, role, is_personal_org, joined_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        membership.id,
        membership.userId,
        membership.organizationId,
        membership.role,
        membership.isPersonalOrg ? 1 : 0,
        membership.joinedAt,
      ],
    });

  const clear = async () => {
    await db.execute({ sql: 'DELETE FROM membership_events' });
    await db.execute({ sql: 'DELETE FROM organization_memberships' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });
  };

  const service = (members: readonly OrganizationMembership[]) =>
    createMembershipService({
      membershipStore: {
        save: () => {
          throw new Error('membership writes go through the unit of work');
        },
        removeMember: () => {
          throw new Error('membership writes go through the unit of work');
        },
        changeMemberRole: () => {
          throw new Error('membership writes go through the unit of work');
        },
        findByUserAndOrg: (userId: string) =>
          okAsync(members.find((membership) => membership.userId === userId) ?? null),
        findByOrganizationId: () => okAsync([...members]),
      } as unknown as OrganizationMembershipStore,
      userService: {
        getUser: (userId: string) => okAsync(userId === ADMIN ? admin : userId === USER ? user : null),
      } as unknown as UserService,
      organizationStore: {
        findById: () => okAsync(organization),
      } as unknown as OrganizationStore,
      clock: createFakeClock(new Date(NOW)),
      idGenerator: createFakeIdGenerator([MEMBERSHIP, '550e8400-e29b-41d4-a716-446655440099']),
      unitOfWork: createSqliteUnitOfWork({
        client: libsqlWriteClient(client),
        participants: [accessSqlParticipant],
      }),
    });

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'yoink-membership-uow-'));
    const opened = openDatabase({ type: 'file', path: join(directory, 'membership.db') });
    db = opened.database;
    client = opened.client;
    await runMigrations(db, migrations);
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });
    await client.execute({ sql: 'PRAGMA foreign_keys = ON' });
  });

  afterAll(async () => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clear();
  });

  it('does not guard the add, delete, or role update', () => {
    const added = compileMembershipPlan(addPlan());
    expect(added).toHaveLength(1);
    expect(added[0]?.guard).toBe(false);
    expect(added[0]?.verb).toBe('insert');
    expect(added[0]?.sql).toContain('INSERT INTO organization_memberships');
    expect(added[0]?.sql).toContain('ON CONFLICT(user_id, organization_id) DO UPDATE');

    const removed = compileMembershipPlan({
      kind: 'remove-member',
      membershipId: MEMBERSHIP,
      event: {
        type: 'MemberLeft',
        id: '550e8400-e29b-41d4-a716-446655440080',
        organizationId: ORG,
        userId: USER,
        role: 'member',
        occurredAt: NOW,
      },
    });
    expect(removed).toHaveLength(2);
    expect(removed[0]?.guard).toBe(false);
    expect(removed[0]?.verb).toBe('delete');
    expect(removed[0]?.sql).toBe('DELETE FROM organization_memberships WHERE id = ?');
    expect(removed[1]?.guard).toBe(false);
    expect(removed[1]?.sql).toContain('INSERT INTO membership_events');

    const switched = compileMembershipPlan({
      kind: 'set-member-role',
      membership: { ...memberMembership, role: 'admin' },
      event: {
        type: 'MemberRoleChanged',
        id: '550e8400-e29b-41d4-a716-446655440081',
        organizationId: ORG,
        userId: USER,
        fromRole: 'member',
        toRole: 'admin',
        actor: { kind: 'member', userId: ADMIN },
        occurredAt: NOW,
      },
    });
    expect(switched[0]?.guard).toBe(false);
    expect(switched[0]?.verb).toBe('update');
    expect(switched[0]?.sql).toBe('UPDATE organization_memberships SET role = ? WHERE id = ?');
    expect(switched[1]?.guard).toBe(false);
  });

  it('leaves no membership when the user row is gone', async () => {
    const result = await commit(addPlan());

    expect(result.isErr() && result.error.kind).toBe('Storage');
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(0);
  });

  it('leaves no membership when addMember commit fails', async () => {
    const added = await service([]).addMember({
      userId: USER,
      organizationId: ORG,
      role: 'member',
    });

    expect(added.isErr() && added.error.type).toBe('MEMBERSHIP_STORAGE_ERROR');
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(0);
  });

  it('refuses a second owner before writing a membership', async () => {
    await insertOrganization();
    await insertUser(user);
    await insertUser(admin);

    const added = await service([adminMembership]).addMember({
      userId: USER,
      organizationId: ORG,
      role: 'owner',
    });

    expect(added.isErr() && added.error.type).toBe('SECOND_OWNER');
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(0);
  });

  it('commits the membership and not an event', async () => {
    await insertOrganization();
    await insertUser(user);

    const added = await service([]).addMember({
      userId: USER,
      organizationId: ORG,
      role: 'member',
    });

    expect(added.isOk() && added._unsafeUnwrap().id).toBe(MEMBERSHIP);
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM membership_events')).toBe(0);
    const row = await db.execute({
      sql: 'SELECT role AS role, is_personal_org AS personal, joined_at AS joinedAt FROM organization_memberships WHERE id = ?',
      args: [MEMBERSHIP],
    });
    expect(row.rows[0]).toEqual({ role: 'member', personal: 0, joinedAt: NOW });
  });

  it('refuses leaving a personal organization before deleting', async () => {
    const left = await service([personalMembership]).removeMember({
      organizationId: ORG,
      userId: USER,
      by: { kind: 'self' },
    });

    expect(left.isErr() && left.error.type).toBe('CANNOT_LEAVE_PERSONAL_ORG');
    expect(await count('SELECT COUNT(*) AS n FROM membership_events')).toBe(0);
  });

  it('commits the delete and the MemberRemoved event together', async () => {
    await insertOrganization();
    await insertUser(user);
    await insertUser(admin);
    await insertMembership(memberMembership);

    const removed = await service([adminMembership, memberMembership]).removeMember({
      organizationId: ORG,
      userId: USER,
      by: { kind: 'member', userId: ADMIN },
    });

    expect(removed.isOk()).toBe(true);
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM membership_events WHERE type = 'MemberRemoved'")).toBe(1);
  });

  it('commits the role update and the MemberRoleChanged event together', async () => {
    await insertOrganization();
    await insertUser(user);
    await insertUser(admin);
    await insertMembership(memberMembership);

    const switched = await service([adminMembership, memberMembership]).changeMemberRole({
      organizationId: ORG,
      userId: USER,
      newRole: 'admin',
      callerUserId: ADMIN,
      callerVia: 'session',
      principalKind: 'human',
    });

    expect(switched.isOk() && switched._unsafeUnwrap().role).toBe('admin');
    const row = await db.execute({
      sql: 'SELECT role AS role FROM organization_memberships WHERE id = ?',
      args: [MEMBERSHIP],
    });
    expect(row.rows[0]).toEqual({ role: 'admin' });
    expect(await count("SELECT COUNT(*) AS n FROM membership_events WHERE type = 'MemberRoleChanged'")).toBe(1);
  });
});
