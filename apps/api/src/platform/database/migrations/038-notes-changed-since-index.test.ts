import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 38: notes_changed_since_index', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('adds the org/updated_at/id index used by the changed-since feed', async () => {
    await runMigrations(db, migrations);
    const result = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`,
      args: ['idx_project_notes_org_updated_id'],
    });
    expect(result.rows).toHaveLength(1);
  });
});
