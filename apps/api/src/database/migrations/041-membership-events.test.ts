import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

const upTo = (version: number) => migrations.filter((migration) => migration.version <= version);

describe('Migration 41: membership events', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('applies cleanly after migration 40', async () => {
    await runMigrations(db, upTo(40));
    const result = await runMigrations(db, migrations);
    expect(result.applied).toContain('membership_events');

    const table = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='membership_events'`,
    });
    expect(table.rows).toHaveLength(1);
  });

  it('accepts an OwnershipTransferred row', async () => {
    await runMigrations(db, migrations);
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
    const rows = await db.execute({
      sql: `SELECT type FROM membership_events WHERE id = ?`,
      args: ['evt-1'],
    });
    expect(rows.rows[0]?.type).toBe('OwnershipTransferred');
  });
});
