import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

const before47 = migrations.filter((migration) => migration.version < 47);
const at = '2026-11-10T00:00:00.000Z';

const foreignKeyTables = async (db: Database): Promise<string[]> => {
  const result = await db.execute({ sql: 'PRAGMA foreign_key_list(tasks)' });
  return result.rows.map((row) => String(row.table)).sort();
};

const indexNames = async (db: Database): Promise<string[]> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tasks' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  });
  return result.rows.map((row) => String(row.name));
};

const taskRow = async (db: Database) => {
  const result = await db.execute({
    sql: `SELECT * FROM tasks WHERE id = ?`,
    args: ['task-1'],
  });
  return result.rows[0];
};

describe('Migration 47: drop tasks.capture_id foreign key', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('keeps the column and the row, and drops only the captures foreign key', async () => {
    await runMigrations(db, before47);
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', at],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'owner@example.com', at],
    });
    await db.execute({
      sql: `INSERT INTO captures (id, organization_id, created_by_id, content, captured_at) VALUES (?, ?, ?, ?, ?)`,
      args: ['capture-1', 'org-1', 'user-1', 'A note', at],
    });
    await db.execute({
      sql: `INSERT INTO lists (id, organization_id, created_by_id, name, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: ['list-1', 'org-1', 'user-1', 'Garden', at],
    });
    await db.execute({
      sql: `INSERT INTO projects (id, organization_id, created_by_id, name, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-1', 'Garden', 'active', at],
    });
    await db.execute({
      sql: `
        INSERT INTO tasks (
          id, organization_id, created_by_id, title, capture_id, due_date,
          completed_at, pinned_at, created_at, deleted_at, assignee_id, list_id,
          open_order, last_changed_at, last_changed_by, completed_by, project_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        'task-1',
        'org-1',
        'user-1',
        'Buy soil',
        'capture-1',
        '2026-11-11',
        null,
        at,
        at,
        null,
        'user-1',
        'list-1',
        0,
        at,
        'user-1',
        null,
        'project-1',
      ],
    });

    expect(await foreignKeyTables(db)).toContain('captures');
    const indexesBefore = await indexNames(db);
    expect(indexesBefore).toContain('idx_tasks_capture');
    const before = await taskRow(db);

    await runMigrations(db, migrations);

    expect(await taskRow(db)).toEqual(before);
    expect(await foreignKeyTables(db)).toEqual(['lists', 'organizations', 'projects', 'users']);
    expect(await indexNames(db)).toEqual(indexesBefore);

    await db.execute({
      sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, capture_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['task-2', 'org-1', 'user-1', 'Orphan source', 'missing-capture', at],
    });
    await expect(
      db.execute({
        sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, list_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ['task-3', 'org-1', 'user-1', 'Missing list', 'missing-list', at],
      })
    ).rejects.toThrow();
    await expect(
      db.execute({
        sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ['task-4', 'org-1', 'user-1', 'Missing project', 'missing-project', at],
      })
    ).rejects.toThrow();

    await db.execute({ sql: `DELETE FROM captures WHERE id = ?`, args: ['capture-1'] });
    const kept = await db.execute({
      sql: `SELECT capture_id FROM tasks WHERE id = ?`,
      args: ['task-1'],
    });
    expect(kept.rows[0]?.capture_id).toBe('capture-1');
  });
});
