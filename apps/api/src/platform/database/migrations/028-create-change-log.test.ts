import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 28: create_change_log', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  const seedOrg = async () => {
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2025-01-15T10:00:00.000Z'],
    });
  };

  it('creates change_log with nullable actor, project_id, and the required indexes', async () => {
    await runMigrations(db, migrations);
    await seedOrg();

    await db.execute({
      sql: `
        INSERT INTO change_log (
          id, organization_id, project_id, subject_type, subject_id,
          kind, schema_version, payload_json, actor_user_id, actor_kind,
          occurred_at, hidden
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        'log-1',
        'org-1',
        null,
        'task',
        'task-1',
        'TaskCreated',
        1,
        '{"title":"Buy milk","openOrder":0,"createdById":"user-1"}',
        null,
        null,
        '2025-01-15T10:00:00.000Z',
        0,
      ],
    });

    const row = await db.execute({
      sql: `SELECT project_id, actor_user_id, actor_kind, hidden FROM change_log WHERE id = ?`,
      args: ['log-1'],
    });
    expect(row.rows[0]?.project_id).toBeNull();
    expect(row.rows[0]?.actor_user_id).toBeNull();
    expect(row.rows[0]?.actor_kind).toBeNull();
    expect(row.rows[0]?.hidden).toBe(0);

    const indexes = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'change_log' ORDER BY name`,
    });
    const names = indexes.rows.map((item) => String(item.name));
    expect(names).toContain('idx_change_log_subject');
    expect(names).toContain('idx_change_log_org');
    expect(names).toContain('idx_change_log_org_project');
  });

  it('adds nullable last_changed and completed_by columns without backfilling', async () => {
    await runMigrations(db, migrations.slice(0, 26));
    await seedOrg();
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'owner@example.com', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ['task-old', 'org-1', 'user-1', 'Old task', '2024-06-01T00:00:00.000Z'],
    });

    await runMigrations(db, migrations);

    const result = await db.execute({
      sql: `SELECT last_changed_at, last_changed_by, completed_by, created_at, created_by_id
            FROM tasks WHERE id = ?`,
      args: ['task-old'],
    });
    expect(result.rows[0]?.created_at).toBe('2024-06-01T00:00:00.000Z');
    expect(result.rows[0]?.created_by_id).toBe('user-1');
    expect(result.rows[0]?.last_changed_at).toBeNull();
    expect(result.rows[0]?.last_changed_by).toBeNull();
    expect(result.rows[0]?.completed_by).toBeNull();
  });
});
