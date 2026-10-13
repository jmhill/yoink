import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 37: add_project_proposals', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('allows declined and frees that name for a new project', async () => {
    await runMigrations(db, migrations);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2026-10-13T17:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'lane@example.com', '2026-10-13T17:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at,
              reason, suggested_next_action
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'project-1',
        'org-1',
        'user-1',
        'Harbor shed',
        'declined',
        '2026-10-13T17:00:00.000Z',
        'Dock needs work',
        'Call the mill',
      ],
    });

    const row = await db.execute({
      sql: `SELECT reason, suggested_next_action, status FROM projects WHERE id = ?`,
      args: ['project-1'],
    });
    expect(row.rows[0]).toEqual({
      reason: 'Dock needs work',
      suggested_next_action: 'Call the mill',
      status: 'declined',
    });

    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        'project-2',
        'org-1',
        'user-1',
        'Harbor shed',
        'active',
        '2026-10-13T18:00:00.000Z',
      ],
    });

    const names = await db.execute({
      sql: `SELECT id, status FROM projects WHERE organization_id = ? ORDER BY created_at`,
      args: ['org-1'],
    });
    expect(names.rows).toHaveLength(2);
  });

  it('still holds a pending proposal name', async () => {
    await runMigrations(db, migrations);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2026-10-13T17:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'lane@example.com', '2026-10-13T17:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        'project-1',
        'org-1',
        'user-1',
        'Harbor shed',
        'proposed',
        '2026-10-13T17:00:00.000Z',
      ],
    });

    await expect(
      db.execute({
        sql: `INSERT INTO projects (
                id, organization_id, created_by_id, name, status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          'project-2',
          'org-1',
          'user-1',
          'harbor shed',
          'active',
          '2026-10-13T18:00:00.000Z',
        ],
      })
    ).rejects.toThrow();
  });
});
