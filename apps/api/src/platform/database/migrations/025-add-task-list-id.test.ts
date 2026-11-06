import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 25: add_task_list_id', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('adds a nullable list_id column that can point at an org list', async () => {
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
      sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, created_at, list_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        'task-1',
        'org-1',
        'user-1',
        'Buy milk',
        '2025-01-15T10:00:00.000Z',
        'list-1',
      ],
    });

    const result = await db.execute({
      sql: `SELECT list_id FROM tasks WHERE id = ?`,
      args: ['task-1'],
    });

    expect(result.rows[0]?.list_id).toBe('list-1');
  });

  it('allows a task with no list', async () => {
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
      sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ['task-1', 'org-1', 'user-1', 'Unlisted', '2025-01-15T10:00:00.000Z'],
    });

    const result = await db.execute({
      sql: `SELECT list_id FROM tasks WHERE id = ?`,
      args: ['task-1'],
    });

    expect(result.rows[0]?.list_id).toBeNull();
  });
});
