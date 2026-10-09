import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

const seedOrgUser = async (db: Database) => {
  await db.execute({
    sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
    args: ['org-1', 'Org', '2026-01-01T00:00:00.000Z'],
  });
  await db.execute({
    sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
    args: ['user-1', 'justin@example.com', '2026-01-01T00:00:00.000Z'],
  });
};

describe('Migration 27: add_token_revoked_at', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('adds revoked_at and leaves existing names untouched', async () => {
    await runMigrations(db, migrations.slice(0, 26));
    await seedOrgUser(db);
    await db.execute({
      sql: `INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, organization_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['token-1', 'user-1', 'hash', 'Lane', '2026-01-01T00:00:00.000Z', 'org-1'],
    });

    await runMigrations(db, migrations);

    const result = await db.execute({
      sql: `SELECT name, revoked_at FROM api_tokens WHERE id = ?`,
      args: ['token-1'],
    });
    expect(result.rows[0]?.name).toBe('Lane');
    expect(result.rows[0]?.revoked_at).toBeNull();
  });

  it('does not add a unique name index', async () => {
    await runMigrations(db, migrations);

    const result = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_api_tokens_org_name_ci'`,
    });
    expect(result.rows).toHaveLength(0);
  });
});
