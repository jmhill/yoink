import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 24: unique_list_name_per_org', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('rejects a second list with the same name ignoring case in one org', async () => {
    await runMigrations(db, migrations);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'lister@example.com', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO lists (id, organization_id, created_by_id, name, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ['list-1', 'org-1', 'user-1', 'Groceries', '2025-01-15T10:00:00.000Z'],
    });

    await expect(
      db.execute({
        sql: `INSERT INTO lists (id, organization_id, created_by_id, name, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: ['list-2', 'org-1', 'user-1', 'groceries', '2025-01-15T11:00:00.000Z'],
      })
    ).rejects.toThrow();
  });

  it('allows the same name in a different organization', async () => {
    await runMigrations(db, migrations);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?), (?, ?, ?)`,
      args: [
        'org-1',
        'Org 1',
        '2025-01-15T10:00:00.000Z',
        'org-2',
        'Org 2',
        '2025-01-15T10:00:00.000Z',
      ],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'lister@example.com', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO lists (id, organization_id, created_by_id, name, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ['list-1', 'org-1', 'user-1', 'Groceries', '2025-01-15T10:00:00.000Z'],
    });

    await expect(
      db.execute({
        sql: `INSERT INTO lists (id, organization_id, created_by_id, name, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: ['list-2', 'org-2', 'user-1', 'Groceries', '2025-01-15T11:00:00.000Z'],
      })
    ).resolves.toBeDefined();
  });
});
