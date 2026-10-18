import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

const upTo = (version: number) => migrations.filter((migration) => migration.version <= version);

const insertOrg = async (db: Database) => {
  await db.execute({
    sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
    args: ['org-1', 'Garden Club', '2024-01-01T00:00:00.000Z'],
  });
};

const insertUser = async (db: Database, id: string, email: string) => {
  await db.execute({
    sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
    args: [id, email, '2024-01-01T00:00:00.000Z'],
  });
};

describe('Migration 43: owner invites', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('applies on top of 042', async () => {
    await runMigrations(db, upTo(42));
    const result = await runMigrations(db, migrations);
    expect(result.applied).toContain('owner_invites');
  });

  it('keeps old invitation and membership event rows', async () => {
    await runMigrations(db, upTo(42));
    await insertOrg(db);
    await insertUser(db, 'user-1', 'justin@example.com');
    await db.execute({
      sql: `
        INSERT INTO invitations (
          id, code, email, organization_id, invited_by_user_id,
          role, expires_at, accepted_at, accepted_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        'inv-1',
        'ABCD1234',
        'libby@example.com',
        'org-1',
        'user-1',
        'member',
        '2024-06-22T12:00:00.000Z',
        null,
        null,
        '2024-06-15T12:00:00.000Z',
      ],
    });
    await db.execute({
      sql: `
        INSERT INTO membership_events (
          id, type, organization_id, user_id,
          from_user_id, to_user_id, from_role, to_role,
          actor_kind, actor_user_id, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        'evt-1',
        'MemberRoleChanged',
        'org-1',
        'user-2',
        null,
        null,
        'member',
        'admin',
        'app-admin',
        null,
        '2024-06-15T12:00:00.000Z',
      ],
    });

    await runMigrations(db, migrations);

    const invites = await db.execute({
      sql: `SELECT role, replaced_at, email FROM invitations WHERE id = ?`,
      args: ['inv-1'],
    });
    expect(invites.rows).toHaveLength(1);
    expect(invites.rows[0]?.role).toBe('member');
    expect(invites.rows[0]?.replaced_at).toBeNull();
    expect(invites.rows[0]?.email).toBe('libby@example.com');

    const events = await db.execute({
      sql: `SELECT type, from_role, to_role FROM membership_events WHERE id = ?`,
      args: ['evt-1'],
    });
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]?.type).toBe('MemberRoleChanged');
    expect(events.rows[0]?.from_role).toBe('member');
    expect(events.rows[0]?.to_role).toBe('admin');
  });

  it('refuses an owner invite with an invited_by_user_id', async () => {
    await runMigrations(db, migrations);
    await insertOrg(db);
    await insertUser(db, 'user-1', 'justin@example.com');
    await expect(
      db.execute({
        sql: `
          INSERT INTO invitations (
            id, code, email, organization_id, invited_by_user_id,
            role, expires_at, accepted_at, accepted_by_user_id, replaced_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'inv-bad',
          'OWNERBAD1',
          'libby@example.com',
          'org-1',
          'user-1',
          'owner',
          '2024-06-22T12:00:00.000Z',
          null,
          null,
          null,
          '2024-06-15T12:00:00.000Z',
        ],
      })
    ).rejects.toThrow();
  });

  it('refuses an owner invite without an email', async () => {
    await runMigrations(db, migrations);
    await insertOrg(db);
    await expect(
      db.execute({
        sql: `
          INSERT INTO invitations (
            id, code, email, organization_id, invited_by_user_id,
            role, expires_at, accepted_at, accepted_by_user_id, replaced_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'inv-bad-email',
          'OWNERBAD2',
          null,
          'org-1',
          null,
          'owner',
          '2024-06-22T12:00:00.000Z',
          null,
          null,
          null,
          '2024-06-15T12:00:00.000Z',
        ],
      })
    ).rejects.toThrow();
  });

  it('refuses a second live owner invite on the same workspace', async () => {
    await runMigrations(db, migrations);
    await insertOrg(db);
    await db.execute({
      sql: `
        INSERT INTO invitations (
          id, code, email, organization_id, invited_by_user_id,
          role, expires_at, accepted_at, accepted_by_user_id, replaced_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        'inv-1',
        'OWNER001',
        'libby@example.com',
        'org-1',
        null,
        'owner',
        '2024-06-22T12:00:00.000Z',
        null,
        null,
        null,
        '2024-06-15T12:00:00.000Z',
      ],
    });
    await expect(
      db.execute({
        sql: `
          INSERT INTO invitations (
            id, code, email, organization_id, invited_by_user_id,
            role, expires_at, accepted_at, accepted_by_user_id, replaced_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'inv-2',
          'OWNER002',
          'polly@example.com',
          'org-1',
          null,
          'owner',
          '2024-06-22T12:00:00.000Z',
          null,
          null,
          null,
          '2024-06-15T12:00:00.000Z',
        ],
      })
    ).rejects.toThrow();
  });

  it('refuses an OwnerAssigned row with actor_kind member', async () => {
    await runMigrations(db, migrations);
    await insertOrg(db);
    await expect(
      db.execute({
        sql: `
          INSERT INTO membership_events (
            id, type, organization_id, user_id,
            from_user_id, to_user_id, from_role, to_role,
            actor_kind, actor_user_id, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'evt-bad',
          'OwnerAssigned',
          'org-1',
          'user-1',
          null,
          null,
          null,
          'owner',
          'member',
          'user-1',
          '2024-06-15T12:00:00.000Z',
        ],
      })
    ).rejects.toThrow();
  });

  it('accepts an OwnerAssigned row from app-admin', async () => {
    await runMigrations(db, migrations);
    await insertOrg(db);
    await db.execute({
      sql: `
        INSERT INTO membership_events (
          id, type, organization_id, user_id,
          from_user_id, to_user_id, from_role, to_role,
          actor_kind, actor_user_id, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        'evt-ok',
        'OwnerAssigned',
        'org-1',
        'user-1',
        null,
        null,
        'member',
        'owner',
        'app-admin',
        null,
        '2024-06-15T12:00:00.000Z',
      ],
    });
    const rows = await db.execute({
      sql: `SELECT actor_kind FROM membership_events WHERE id = ?`,
      args: ['evt-ok'],
    });
    expect(rows.rows[0]?.actor_kind).toBe('app-admin');
  });
});
