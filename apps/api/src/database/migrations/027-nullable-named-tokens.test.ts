import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 27: nullable_named_tokens', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('clears existing names so legacy tokens show as unnamed', async () => {
    await runMigrations(db, migrations.slice(0, 26));

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2026-01-01T00:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'justin@example.com', '2026-01-01T00:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, organization_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['token-1', 'user-1', 'hash', 'old-name', '2026-01-01T00:00:00.000Z', 'org-1'],
    });

    await runMigrations(db, migrations);

    const result = await db.execute({
      sql: `SELECT name FROM api_tokens WHERE id = ?`,
      args: ['token-1'],
    });
    expect(result.rows[0]?.name).toBeNull();
  });

  it('rejects a second named token with the same name ignoring case in one org', async () => {
    await runMigrations(db, migrations);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2026-01-01T00:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'justin@example.com', '2026-01-01T00:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, organization_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['token-1', 'user-1', 'hash', 'Lane', '2026-01-01T00:00:00.000Z', 'org-1'],
    });

    await expect(
      db.execute({
        sql: `INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, organization_id)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: ['token-2', 'user-1', 'hash', 'lane', '2026-01-02T00:00:00.000Z', 'org-1'],
      })
    ).rejects.toThrow();
  });

  it('allows several unnamed tokens in the same organization', async () => {
    await runMigrations(db, migrations);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2026-01-01T00:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'justin@example.com', '2026-01-01T00:00:00.000Z'],
    });

    await expect(
      db.execute({
        sql: `INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, organization_id)
              VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
        args: [
          'token-1',
          'user-1',
          'hash',
          null,
          '2026-01-01T00:00:00.000Z',
          'org-1',
          'token-2',
          'user-1',
          'hash',
          null,
          '2026-01-02T00:00:00.000Z',
          'org-1',
        ],
      })
    ).resolves.toBeDefined();
  });
});
