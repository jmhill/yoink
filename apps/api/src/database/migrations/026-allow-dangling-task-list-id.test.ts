import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 26: allow_dangling_task_list_id', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('lets a list be deleted while a completed task keeps its stored list_id', async () => {
    await runMigrations(db, migrations);

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
    await db.execute({
      sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, created_at, completed_at, list_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'task-1',
        'org-1',
        'user-1',
        'Buy milk',
        '2025-01-15T10:00:00.000Z',
        '2025-01-15T11:00:00.000Z',
        'list-1',
      ],
    });

    await db.execute({ sql: `PRAGMA foreign_keys = ON` });

    const deleted = await db.execute({
      sql: `DELETE FROM lists WHERE id = ?`,
      args: ['list-1'],
    });
    expect(deleted.rowsAffected).toBe(1);

    const task = await db.execute({
      sql: `SELECT list_id FROM tasks WHERE id = ?`,
      args: ['task-1'],
    });
    expect(task.rows[0]?.list_id).toBe('list-1');
  });

  it('does not keep a foreign key from tasks.list_id to lists', async () => {
    await runMigrations(db, migrations);

    const fks = await db.execute({ sql: `PRAGMA foreign_key_list(tasks)` });
    const tables = fks.rows.map((row) => row.table);
    expect(tables).not.toContain('lists');
  });
});
