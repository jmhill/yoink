import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import { migration as dropProjectNotesProjectForeignKey } from './048-drop-project-notes-project-foreign-key.js';
import type { Database, QueryResult } from '../types.js';

const before48 = migrations.filter((migration) => migration.version < 48);
const at = '2026-11-10T00:00:00.000Z';

const foreignKeyTables = async (db: Database): Promise<string[]> => {
  const result = await db.execute({ sql: 'PRAGMA foreign_key_list(project_notes)' });
  return result.rows.map((row) => String(row.table)).sort();
};

const indexNames = async (db: Database): Promise<string[]> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'project_notes' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  });
  return result.rows.map((row) => String(row.name));
};

const noteRow = async (db: Database) => {
  const result = await db.execute({
    sql: `SELECT * FROM project_notes WHERE id = ?`,
    args: ['note-1'],
  });
  return result.rows[0];
};

/**
 * Turso HTTP opens a new stream per request. `PRAGMA foreign_keys = OFF` on
 * one `execute` does not apply to the next `batch`, which begins with foreign
 * keys on. `migrate` is one stream: foreign keys off before `BEGIN`.
 */
const tursoHttpDatabase = (inner: Database): Database => {
  const ignored: QueryResult = { rows: [], rowsAffected: 0 };
  return {
    execute: (query) => {
      if (/PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(query.sql)) {
        return Promise.resolve(ignored);
      }
      return inner.execute(query);
    },
    batch: async (queries, mode) => {
      await inner.execute({ sql: 'PRAGMA foreign_keys = ON' });
      return inner.batch(queries, mode);
    },
    migrate: (queries) => {
      const migrate = inner.migrate;
      if (migrate === undefined) {
        throw new Error('expected migrate');
      }
      return migrate(queries);
    },
    close: () => inner.close(),
  };
};

const seedNoteOnProject = async (db: Database): Promise<void> => {
  await db.execute({
    sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
    args: ['org-1', 'Org', at],
  });
  await db.execute({
    sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
    args: ['user-1', 'lane@example.com', at],
  });
  await db.execute({
    sql: `INSERT INTO projects (
            id, organization_id, created_by_id, name, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['project-1', 'org-1', 'user-1', 'Garden', 'active', at],
  });
  await db.execute({
    sql: `
      INSERT INTO project_notes (
        id, organization_id, project_id, title, body, version,
        created_at, created_by, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: ['note-1', 'org-1', 'project-1', 'Meeting notes', '', '1', at, 'user-1', at, 'user-1'],
  });
};

describe('Migration 48: drop project_notes.project_id foreign key', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('keeps the column and the row, and drops only the projects foreign key', async () => {
    await runMigrations(db, before48);
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', at],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'lane@example.com', at],
    });
    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-1', 'Garden', 'active', at],
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
        at,
        'user-1',
        at,
        'user-1',
      ],
    });

    expect(await foreignKeyTables(db)).toContain('projects');
    const indexesBefore = await indexNames(db);
    expect(indexesBefore).toEqual([
      'idx_project_notes_org_project_updated',
      'idx_project_notes_org_updated_id',
    ]);
    const before = await noteRow(db);
    await expect(
      db.execute({ sql: `DELETE FROM projects WHERE id = ?`, args: ['project-1'] })
    ).rejects.toThrow();

    await runMigrations(db, migrations);

    expect(await noteRow(db)).toEqual(before);
    expect(await foreignKeyTables(db)).toEqual(['organizations', 'users', 'users']);
    expect(await indexNames(db)).toEqual(indexesBefore);

    await db.execute({ sql: `DELETE FROM projects WHERE id = ?`, args: ['project-1'] });
    const kept = await db.execute({
      sql: `SELECT project_id FROM project_notes WHERE id = ?`,
      args: ['note-1'],
    });
    expect(kept.rows[0]?.project_id).toBe('project-1');

    await db.execute({
      sql: `
        INSERT INTO project_notes (
          id, organization_id, project_id, title, version,
          created_at, created_by, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: ['note-2', 'org-1', 'missing-project', 'Orphan', '1', at, 'user-1', at, 'user-1'],
    });
    await expect(
      db.execute({
        sql: `
          INSERT INTO project_notes (
            id, organization_id, project_id, title, version,
            created_at, created_by, updated_at, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: ['note-3', 'org-1', 'project-1', 'Missing user', '1', at, 'missing-user', at, 'user-1'],
      })
    ).rejects.toThrow();
  });

  it('applies up() when a row references project_notes and a standalone foreign_keys pragma does not reach batch', async () => {
    await runMigrations(db, before48);
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });
    await seedNoteOnProject(db);
    // No checked-in table references project_notes. This row is the 047
    // condition: DROP TABLE fails while foreign keys stay on.
    await db.execute({
      sql: `CREATE TABLE note_backrefs (
              id TEXT PRIMARY KEY,
              note_id TEXT NOT NULL REFERENCES project_notes(id)
            )`,
    });
    await db.execute({
      sql: `INSERT INTO note_backrefs (id, note_id) VALUES (?, ?)`,
      args: ['ref-1', 'note-1'],
    });
    const before = await noteRow(db);

    await dropProjectNotesProjectForeignKey.up(tursoHttpDatabase(db));

    expect(await noteRow(db)).toEqual(before);
    expect(await foreignKeyTables(db)).toEqual(['organizations', 'users', 'users']);
    expect(await indexNames(db)).toEqual([
      'idx_project_notes_org_project_updated',
      'idx_project_notes_org_updated_id',
    ]);
    const backref = await db.execute({
      sql: `SELECT note_id FROM note_backrefs WHERE id = ?`,
      args: ['ref-1'],
    });
    expect(backref.rows[0]?.note_id).toBe('note-1');
    const foreignKeyCheck = await db.execute({ sql: 'PRAGMA foreign_key_check' });
    expect(foreignKeyCheck.rows).toEqual([]);
    const leftover = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE name IN ('project_notes_new', '_yoink_fk_guard')`,
    });
    expect(leftover.rows).toEqual([]);
  });
});
