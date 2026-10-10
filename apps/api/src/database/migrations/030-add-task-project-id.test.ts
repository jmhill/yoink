import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 30: add_task_project_id', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('adds a nullable project_id column that can point at an org project', async () => {
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
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-1', 'Garden', 'active', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO tasks (
              id, organization_id, created_by_id, title, created_at, project_id
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        'task-1',
        'org-1',
        'user-1',
        'Buy soil',
        '2025-01-15T10:00:00.000Z',
        'project-1',
      ],
    });

    const result = await db.execute({
      sql: `SELECT project_id FROM tasks WHERE id = ?`,
      args: ['task-1'],
    });

    expect(result.rows[0]?.project_id).toBe('project-1');
  });

  it('allows a task with no project', async () => {
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
      sql: `SELECT project_id FROM tasks WHERE id = ?`,
      args: ['task-1'],
    });

    expect(result.rows[0]?.project_id).toBeNull();
  });

  it('creates the project open-task index', async () => {
    await runMigrations(db, migrations);

    const result = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_tasks_project'`,
    });

    expect(result.rows).toHaveLength(1);
  });
});
