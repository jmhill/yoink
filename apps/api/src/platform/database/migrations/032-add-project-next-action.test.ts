import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 32: add_project_next_action', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('adds a nullable next_action_task_id column that can reference a task', async () => {
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
              id, organization_id, created_by_id, title, project_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['task-1', 'org-1', 'user-1', 'Buy soil', 'project-1', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `UPDATE projects SET next_action_task_id = ? WHERE id = ?`,
      args: ['task-1', 'project-1'],
    });

    const result = await db.execute({
      sql: `SELECT next_action_task_id FROM projects WHERE id = ?`,
      args: ['project-1'],
    });

    expect(result.rows[0]?.next_action_task_id).toBe('task-1');
  });

  it('leaves next_action_task_id null on an existing project', async () => {
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

    const result = await db.execute({
      sql: `SELECT next_action_task_id FROM projects WHERE id = ?`,
      args: ['project-1'],
    });

    expect(result.rows[0]?.next_action_task_id).toBeNull();
  });
});
