import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 39: notes_mirror_bot', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('adds the per-org designated notes-mirror bot column', async () => {
    await runMigrations(db, migrations);
    const result = await db.execute({
      sql: `SELECT notes_mirror_bot_user_id FROM organizations LIMIT 0`,
    });
    expect(result.rows).toEqual([]);
  });
});
