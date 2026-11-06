import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 36: add_project_notes', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates project_notes and allows a note subject on the change log', async () => {
    await runMigrations(db, migrations);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2026-10-12T18:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'lane@example.com', '2026-10-12T18:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-1', 'Garden', 'active', '2026-10-12T18:00:00.000Z'],
    });
    await db.execute({
      sql: `
        INSERT INTO project_notes (
          id, organization_id, project_id, title, body, version,
          created_at, created_by, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        'note-1',
        'org-1',
        'project-1',
        'Meeting notes',
        '',
        '1',
        '2026-10-12T18:00:00.000Z',
        'user-1',
        '2026-10-12T18:00:00.000Z',
        'user-1',
      ],
    });
    await db.execute({
      sql: `
        INSERT INTO change_log (
          id, organization_id, project_id, subject_type, subject_id,
          kind, schema_version, payload_json, actor_user_id, actor_kind,
          occurred_at, hidden, seq
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        'log-1',
        'org-1',
        'project-1',
        'note',
        'note-1',
        'NoteCreated',
        1,
        '{"title":"Meeting notes"}',
        'user-1',
        'user',
        '2026-10-12T18:00:00.000Z',
        0,
        1,
      ],
    });

    const note = await db.execute({
      sql: `SELECT title, deleted_at, created_at, updated_at FROM project_notes WHERE id = ?`,
      args: ['note-1'],
    });
    expect(note.rows[0]?.title).toBe('Meeting notes');
    expect(note.rows[0]?.deleted_at).toBeNull();
    expect(note.rows[0]?.created_at).toBe('2026-10-12T18:00:00.000Z');
    expect(note.rows[0]?.updated_at).toBe('2026-10-12T18:00:00.000Z');

    const log = await db.execute({
      sql: `SELECT subject_type FROM change_log WHERE id = ?`,
      args: ['log-1'],
    });
    expect(log.rows[0]?.subject_type).toBe('note');
  });
});
