import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

const upTo = (version: number) => migrations.filter((migration) => migration.version <= version);

describe('Migration 42: membership events v2', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('applies cleanly after migration 41', async () => {
    await runMigrations(db, upTo(41));
    const result = await runMigrations(db, migrations);
    expect(result.applied).toContain('membership_events_v2');
  });

  it('keeps 041 OwnershipTransferred rows with the same values', async () => {
    await runMigrations(db, upTo(41));
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Polly UX', '2024-01-01T00:00:00.000Z'],
    });
    await db.execute({
      sql: `
        INSERT INTO membership_events
          (id, type, organization_id, from_user_id, to_user_id, actor_user_id, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        'evt-1',
        'OwnershipTransferred',
        'org-1',
        'user-1',
        'user-2',
        'user-1',
        '2024-06-15T12:00:00.000Z',
      ],
    });

    await runMigrations(db, migrations);

    const rows = await db.execute({
      sql: `
        SELECT type, user_id, from_user_id, to_user_id, from_role, to_role,
               actor_kind, actor_user_id
        FROM membership_events WHERE id = ?
      `,
      args: ['evt-1'],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.type).toBe('OwnershipTransferred');
    expect(rows.rows[0]?.user_id).toBe('user-2');
    expect(rows.rows[0]?.from_user_id).toBe('user-1');
    expect(rows.rows[0]?.to_user_id).toBe('user-2');
    expect(rows.rows[0]?.from_role).toBeNull();
    expect(rows.rows[0]?.to_role).toBeNull();
    expect(rows.rows[0]?.actor_kind).toBe('member');
    expect(rows.rows[0]?.actor_user_id).toBe('user-1');
  });

  it('refuses a MemberRoleChanged row missing roles', async () => {
    await runMigrations(db, migrations);
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Polly UX', '2024-01-01T00:00:00.000Z'],
    });
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
          'evt-bad-role',
          'MemberRoleChanged',
          'org-1',
          'user-2',
          null,
          null,
          null,
          null,
          'member',
          'user-1',
          '2024-06-15T12:00:00.000Z',
        ],
      })
    ).rejects.toThrow();
  });

  it('refuses an app-admin actor with an actor_user_id', async () => {
    await runMigrations(db, migrations);
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Polly UX', '2024-01-01T00:00:00.000Z'],
    });
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
          'evt-bad-admin',
          'MemberRoleChanged',
          'org-1',
          'user-2',
          null,
          null,
          'member',
          'admin',
          'app-admin',
          'user-1',
          '2024-06-15T12:00:00.000Z',
        ],
      })
    ).rejects.toThrow();
  });

  it('refuses a MemberRemoved row with actor_kind self', async () => {
    await runMigrations(db, migrations);
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Polly UX', '2024-01-01T00:00:00.000Z'],
    });
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
          'evt-bad-removed',
          'MemberRemoved',
          'org-1',
          'user-2',
          null,
          null,
          'member',
          null,
          'self',
          'user-2',
          '2024-06-15T12:00:00.000Z',
        ],
      })
    ).rejects.toThrow();
  });

  it('refuses a MemberLeft row with actor_kind member', async () => {
    await runMigrations(db, migrations);
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Polly UX', '2024-01-01T00:00:00.000Z'],
    });
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
          'evt-bad-left',
          'MemberLeft',
          'org-1',
          'user-2',
          null,
          null,
          'admin',
          null,
          'member',
          'user-2',
          '2024-06-15T12:00:00.000Z',
        ],
      })
    ).rejects.toThrow();
  });

  it('accepts a MemberRoleChanged row from an app-admin', async () => {
    await runMigrations(db, migrations);
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Polly UX', '2024-01-01T00:00:00.000Z'],
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
        'evt-ok',
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
    const rows = await db.execute({
      sql: `SELECT actor_kind FROM membership_events WHERE id = ?`,
      args: ['evt-ok'],
    });
    expect(rows.rows[0]?.actor_kind).toBe('app-admin');
  });
});
