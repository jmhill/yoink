import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 29: create_projects', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  const seedOrgAndUser = async () => {
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'owner@example.com', '2025-01-15T10:00:00.000Z'],
    });
  };

  it('keeps existing change_log rows and recreates the required indexes', async () => {
    await runMigrations(db, migrations.slice(0, 28));
    await seedOrgAndUser();

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
        'user-1',
        'user',
        '2025-01-15T10:00:00.000Z',
        0,
      ],
    });

    await runMigrations(db, migrations);

    const row = await db.execute({
      sql: `SELECT id, subject_type, kind, actor_user_id, actor_kind, payload_json
            FROM change_log WHERE id = ?`,
      args: ['log-1'],
    });
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]?.subject_type).toBe('task');
    expect(row.rows[0]?.kind).toBe('TaskCreated');
    expect(row.rows[0]?.actor_user_id).toBe('user-1');
    expect(row.rows[0]?.actor_kind).toBe('user');
    expect(row.rows[0]?.payload_json).toBe(
      '{"title":"Buy milk","openOrder":0,"createdById":"user-1"}'
    );

    const indexes = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'change_log' ORDER BY name`,
    });
    const names = indexes.rows.map((item) => String(item.name));
    expect(names).toContain('idx_change_log_subject');
    expect(names).toContain('idx_change_log_org');
    expect(names).toContain('idx_change_log_org_project');
  });

  it('creates projects with a case-insensitive unique name per organization', async () => {
    await runMigrations(db, migrations);
    await seedOrgAndUser();

    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-1', 'Garden', 'active', '2025-01-15T10:00:00.000Z'],
    });

    await expect(
      db.execute({
        sql: `INSERT INTO projects (
                id, organization_id, created_by_id, name, status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ['project-2', 'org-1', 'user-1', 'garden', 'active', '2025-01-15T11:00:00.000Z'],
      })
    ).rejects.toThrow();
  });

  it('accepts a project subject_type on change_log after rebuild', async () => {
    await runMigrations(db, migrations);
    await seedOrgAndUser();

    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-1', 'Garden', 'active', '2025-01-15T10:00:00.000Z'],
    });

    await expect(
      db.execute({
        sql: `
          INSERT INTO change_log (
            id, organization_id, project_id, subject_type, subject_id,
            kind, schema_version, payload_json, actor_user_id, actor_kind,
            occurred_at, hidden
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'log-project',
          'org-1',
          'project-1',
          'project',
          'project-1',
          'ProjectCreated',
          1,
          '{"name":"Garden","status":"active","createdById":"user-1"}',
          'user-1',
          'user',
          '2025-01-15T10:00:00.000Z',
          0,
        ],
      })
    ).resolves.toBeDefined();
  });
});
