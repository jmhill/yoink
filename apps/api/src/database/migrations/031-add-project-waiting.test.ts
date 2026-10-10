import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 31: add_project_waiting', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('adds nullable waiting_on and waiting_since columns', async () => {
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
              id, organization_id, created_by_id, name, status, created_at,
              waiting_on, waiting_since
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'project-1',
        'org-1',
        'user-1',
        'Garden',
        'waiting',
        '2025-01-15T10:00:00.000Z',
        'Mike',
        '2025-01-03',
      ],
    });

    const result = await db.execute({
      sql: `SELECT waiting_on, waiting_since FROM projects WHERE id = ?`,
      args: ['project-1'],
    });

    expect(result.rows[0]?.waiting_on).toBe('Mike');
    expect(result.rows[0]?.waiting_since).toBe('2025-01-03');
  });

  it('allows a project with unknown waiting since', async () => {
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
              id, organization_id, created_by_id, name, status, created_at,
              waiting_on, waiting_since
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'project-1',
        'org-1',
        'user-1',
        'Garden',
        'waiting',
        '2025-01-15T10:00:00.000Z',
        'Trident',
        null,
      ],
    });

    const result = await db.execute({
      sql: `SELECT waiting_on, waiting_since FROM projects WHERE id = ?`,
      args: ['project-1'],
    });

    expect(result.rows[0]?.waiting_on).toBe('Trident');
    expect(result.rows[0]?.waiting_since).toBeNull();
  });

  it('leaves waiting fields null on an active project', async () => {
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
      sql: `SELECT waiting_on, waiting_since FROM projects WHERE id = ?`,
      args: ['project-1'],
    });

    expect(result.rows[0]?.waiting_on).toBeNull();
    expect(result.rows[0]?.waiting_since).toBeNull();
  });
});
