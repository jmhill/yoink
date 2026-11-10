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
import { createInvitationService } from '../../application/handle-invitation.js';
import { planCreateInvitation } from '../../domain/decide-create-invitation.js';
import { planRevokeInvitation } from '../../domain/decide-revoke-invitation.js';
import type { CreateInvitationPlan, InvitationPlan } from '../../domain/invitation-plan.js';
import type { InvitationStore } from '../../domain/invitation-store.js';
import type { OrganizationMembership } from '../../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../../domain/organization-membership-store.js';
import type { Organization } from '../../domain/organization.js';
import type { OrganizationStore } from '../../domain/organization-store.js';
import { accessSqlParticipant } from './access-sql-participant.js';
import { compileInvitationPlan } from './compile-invitation.js';

const NOW = '2024-01-15T12:00:00.000Z';
const ORG = '550e8400-e29b-41d4-a716-446655440001';
const ADMIN = '550e8400-e29b-41d4-a716-446655440010';
const INVITE = '550e8400-e29b-41d4-a716-446655440200';
const CODE = 'TESTCODE';

const organization: Organization = {
  id: ORG,
  name: 'Team Org',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const adminMembership: OrganizationMembership = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: ADMIN,
  organizationId: ORG,
  role: 'admin',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

const memberMembership: OrganizationMembership = {
  ...adminMembership,
  id: '550e8400-e29b-41d4-a716-446655440021',
  userId: '550e8400-e29b-41d4-a716-446655440011',
  role: 'member',
};

const createPlan = (): CreateInvitationPlan =>
  planCreateInvitation({
    request: {
      organizationId: ORG,
      invitedByUserId: ADMIN,
      role: 'member',
      email: 'specific@example.com',
      expiresInDays: 7,
      skipPermissionCheck: false,
    },
    id: INVITE,
    code: CODE,
    now: NOW,
  });

describe('invitation unit of work', () => {
  let db: Database;
  let client: Client;
  let directory: string;

  const count = async (sql: string, args: readonly unknown[] = []): Promise<number> => {
    const result = await db.execute({ sql, args: [...args] });
    return Number(result.rows[0]?.n ?? 0);
  };

  const commit = (plan: InvitationPlan) =>
    createSqliteUnitOfWork({
      client: libsqlWriteClient(client),
      participants: [accessSqlParticipant],
    }).commit([{ result: null, events: [], step: { owner: 'access', plan } }]);

  const insertOrganization = () =>
    db.execute({
      sql: 'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)',
      args: [organization.id, organization.name, organization.createdAt],
    });

  const insertInviter = () =>
    db.execute({
      sql: 'INSERT INTO users (id, email, name, kind, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [ADMIN, 'admin@example.com', 'Ada', 'human', organization.createdAt],
    });

  const clear = async () => {
    await db.execute({ sql: 'DELETE FROM invitations' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });
  };

  const service = (membership: OrganizationMembership | null) =>
    createInvitationService({
      invitationStore: {
        save: () => {
          throw new Error('invitation writes go through the unit of work');
        },
        delete: () => {
          throw new Error('invitation writes go through the unit of work');
        },
        findById: () => okAsync(createPlan().invitation),
      } as unknown as InvitationStore,
      organizationStore: {
        findById: () => okAsync(organization),
      } as unknown as OrganizationStore,
      membershipStore: {
        findByUserAndOrg: () => okAsync(membership),
      } as unknown as OrganizationMembershipStore,
      clock: createFakeClock(new Date(NOW)),
      idGenerator: createFakeIdGenerator([INVITE]),
      codeGenerator: { generate: () => CODE },
      unitOfWork: createSqliteUnitOfWork({
        client: libsqlWriteClient(client),
        participants: [accessSqlParticipant],
      }),
    });

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'yoink-invitation-uow-'));
    const opened = openDatabase({ type: 'file', path: join(directory, 'invitation.db') });
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

  it('does not guard the invitation insert or the delete', () => {
    const created = compileInvitationPlan(createPlan());
    expect(created).toHaveLength(1);
    expect(created[0]?.guard).toBe(false);
    expect(created[0]?.verb).toBe('insert');
    expect(created[0]?.sql).toContain('INSERT INTO invitations');
    expect(created[0]?.sql).toContain('ON CONFLICT(id) DO UPDATE');

    const revoked = compileInvitationPlan(planRevokeInvitation({ invitationId: INVITE }));
    expect(revoked).toHaveLength(1);
    expect(revoked[0]?.guard).toBe(false);
    expect(revoked[0]?.verb).toBe('delete');
    expect(revoked[0]?.sql).toBe('DELETE FROM invitations WHERE id = ?');
  });

  it('leaves no invitation when the workspace row is gone', async () => {
    const result = await commit(createPlan());

    expect(result.isErr() && result.error.kind).toBe('Storage');
    expect(await count('SELECT COUNT(*) AS n FROM invitations')).toBe(0);
  });

  it('leaves no invitation when createInvitation commit fails', async () => {
    const created = await service(adminMembership).createInvitation({
      organizationId: ORG,
      invitedByUserId: ADMIN,
      role: 'member',
      email: 'specific@example.com',
    });

    expect(created.isErr() && created.error.type).toBe('INVITATION_STORAGE_ERROR');
    expect(await count('SELECT COUNT(*) AS n FROM invitations')).toBe(0);
  });

  it('refuses a member before writing an invitation', async () => {
    await insertOrganization();

    const created = await service(memberMembership).createInvitation({
      organizationId: ORG,
      invitedByUserId: memberMembership.userId,
      role: 'member',
    });

    expect(created.isErr() && created.error.type).toBe('INSUFFICIENT_INVITE_PERMISSIONS');
    expect(await count('SELECT COUNT(*) AS n FROM invitations')).toBe(0);
  });

  it('commits the invitation and not a membership', async () => {
    await insertOrganization();
    await insertInviter();

    const created = await service(adminMembership).createInvitation({
      organizationId: ORG,
      invitedByUserId: ADMIN,
      role: 'member',
      email: 'specific@example.com',
    });

    expect(created.isOk() && created._unsafeUnwrap().code).toBe(CODE);
    expect(await count('SELECT COUNT(*) AS n FROM invitations')).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(0);
    const row = await db.execute({
      sql: 'SELECT email AS email, expires_at AS expiresAt, invited_by_user_id AS invitedBy FROM invitations WHERE id = ?',
      args: [INVITE],
    });
    expect(row.rows[0]).toEqual({
      email: 'specific@example.com',
      expiresAt: '2024-01-22T12:00:00.000Z',
      invitedBy: ADMIN,
    });
  });

  it('deletes the invitation and leaves the membership table alone', async () => {
    await insertOrganization();
    await insertInviter();
    const saved = await commit(createPlan());
    expect(saved.isOk()).toBe(true);

    const revoked = await service(adminMembership).revokeInvitation({
      invitationId: INVITE,
      revokedByUserId: ADMIN,
    });

    expect(revoked.isOk()).toBe(true);
    expect(await count('SELECT COUNT(*) AS n FROM invitations')).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(0);
  });
});
