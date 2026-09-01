import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 26: add_task_open_order', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  const seedOrgUserList = async () => {
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'owner@example.com', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO lists (id, organization_id, created_by_id, name, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ['list-1', 'org-1', 'user-1', 'Groceries', '2025-01-15T10:00:00.000Z'],
    });
  };

  it('gives existing open-on-list rows a stable order by createdAt', async () => {
    await runMigrations(db, migrations.slice(0, 25));
    await seedOrgUserList();

    await db.execute({
      sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, created_at, list_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['task-later', 'org-1', 'user-1', 'Eggs', '2025-01-15T11:00:00.000Z', 'list-1'],
    });
    await db.execute({
      sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, created_at, list_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['task-earlier', 'org-1', 'user-1', 'Milk', '2025-01-15T10:00:00.000Z', 'list-1'],
    });

    await runMigrations(db, migrations);

    const result = await db.execute({
      sql: `SELECT id, open_order FROM tasks WHERE list_id = ? ORDER BY open_order ASC`,
      args: ['list-1'],
    });

    expect(result.rows).toEqual([
      { id: 'task-earlier', open_order: 0 },
      { id: 'task-later', open_order: 1 },
    ]);
  });

  it('orders unlisted piles separately from named lists', async () => {
    await runMigrations(db, migrations.slice(0, 25));
    await seedOrgUserList();

    await db.execute({
      sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, created_at, list_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['listed', 'org-1', 'user-1', 'Milk', '2025-01-15T10:00:00.000Z', 'list-1'],
    });
    await db.execute({
      sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ['unlisted', 'org-1', 'user-1', 'Loose end', '2025-01-15T10:00:00.000Z'],
    });

    await runMigrations(db, migrations);

    const listed = await db.execute({
      sql: `SELECT open_order FROM tasks WHERE id = ?`,
      args: ['listed'],
    });
    const unlisted = await db.execute({
      sql: `SELECT open_order FROM tasks WHERE id = ?`,
      args: ['unlisted'],
    });

    expect(listed.rows[0]?.open_order).toBe(0);
    expect(unlisted.rows[0]?.open_order).toBe(0);
  });
});
