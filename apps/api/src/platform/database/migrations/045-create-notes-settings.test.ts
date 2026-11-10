import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 45: create notes_settings', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates an empty notes_settings table and leaves the old column', async () => {
    await runMigrations(db, migrations);
    const created = await db.execute({
      sql: `SELECT organization_id, notes_mirror_bot_user_id FROM notes_settings`,
    });
    expect(created.rows).toEqual([]);
    const oldColumn = await db.execute({
      sql: `SELECT notes_mirror_bot_user_id FROM organizations LIMIT 0`,
    });
    expect(oldColumn.rows).toEqual([]);
  });
});
