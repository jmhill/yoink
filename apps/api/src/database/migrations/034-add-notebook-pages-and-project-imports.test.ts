import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 34: add_notebook_pages_and_project_imports', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('adds notebook_pages defaulting to an empty JSON array', async () => {
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
      sql: `SELECT notebook_pages FROM projects WHERE id = ?`,
      args: ['project-1'],
    });

    expect(result.rows[0]?.notebook_pages).toBe('[]');
  });

  it('creates the staged-import table scoped by organization', async () => {
    await runMigrations(db, migrations);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'lane@yoink.invalid', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `
        INSERT INTO project_imports (
          id, organization_id, created_by, created_at, status, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        'import-1',
        'org-1',
        'user-1',
        '2025-01-15T10:00:00.000Z',
        'pending',
        '{"projects":[]}',
      ],
    });

    const result = await db.execute({
      sql: `SELECT id, status, decided_by, decided_at FROM project_imports WHERE id = ?`,
      args: ['import-1'],
    });

    expect(result.rows[0]?.id).toBe('import-1');
    expect(result.rows[0]?.status).toBe('pending');
    expect(result.rows[0]?.decided_by).toBeNull();
    expect(result.rows[0]?.decided_at).toBeNull();
  });

  it('does not add a last_moved_on column', async () => {
    await runMigrations(db, migrations);

    const columns = await db.execute({
      sql: `PRAGMA table_info(projects)`,
    });
    const names = columns.rows.map((row) => row.name);
    expect(names).toContain('notebook_pages');
    expect(names).not.toContain('last_moved_on');
  });
});
