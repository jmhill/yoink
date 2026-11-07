import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

const COLUMNS = `
  id, organization_id, project_id, subject_type, subject_id,
  kind, schema_version, payload_json, actor_user_id, actor_kind,
  occurred_at, hidden, seq
`;

const before44 = migrations.filter((migration) => migration.version < 44);

const insertLog = async (
  db: Database,
  input: {
    id: string;
    subjectType: string;
    subjectId: string;
    kind: string;
    projectId?: string | null;
    actorUserId?: string | null;
    actorKind?: string | null;
    hidden?: number;
    seq: number;
    payload?: string;
  }
) => {
  await db.execute({
    sql: `
      INSERT INTO change_log (${COLUMNS})
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      input.id,
      'org-1',
      input.projectId === undefined ? 'project-1' : input.projectId,
      input.subjectType,
      input.subjectId,
      input.kind,
      1,
      input.payload ?? '{}',
      input.actorUserId === undefined ? 'user-1' : input.actorUserId,
      input.actorKind === undefined ? 'user' : input.actorKind,
      '2026-11-07T00:00:00.000Z',
      input.hidden ?? 0,
      input.seq,
    ],
  });
};

const seedOrg = async (db: Database) => {
  await db.execute({
    sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
    args: ['org-1', 'Org', '2026-11-07T00:00:00.000Z'],
  });
};

const rows = async (db: Database) => {
  const result = await db.execute({
    sql: `SELECT ${COLUMNS} FROM change_log ORDER BY seq, id`,
  });
  return result.rows;
};

const indexShape = async (db: Database) => {
  const list = await db.execute({ sql: 'PRAGMA index_list(change_log)' });
  const shapes = [];
  for (const row of list.rows) {
    const name = String(row.name);
    const info = await db.execute({ sql: `PRAGMA index_info('${name}')` });
    shapes.push({
      name,
      unique: row.unique,
      origin: row.origin,
      partial: row.partial,
      columns: info.rows.map((column) => column.name),
    });
  }
  return shapes.sort((left, right) => left.name.localeCompare(right.name));
};

const triggers = async (db: Database) => {
  const result = await db.execute({
    sql: `
      SELECT name, sql FROM sqlite_master
      WHERE type = 'trigger' AND tbl_name = 'change_log'
      ORDER BY name
    `,
  });
  return result.rows;
};

const foreignKeys = async (db: Database) => {
  const result = await db.execute({ sql: 'PRAGMA foreign_key_list(change_log)' });
  return result.rows;
};

const columns = async (db: Database) => {
  const result = await db.execute({ sql: 'PRAGMA table_info(change_log)' });
  return result.rows.map((row) => ({
    name: row.name,
    type: row.type,
    notnull: row.notnull,
    dflt_value: row.dflt_value,
    pk: row.pk,
  }));
};

const tableSql = async (db: Database) => {
  const result = await db.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'change_log'`,
  });
  return String(result.rows[0]?.sql ?? '');
};

describe('Migration 44: allow_capture_change_log_subject', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('keeps populated rows, indexes, and checks, and accepts capture', async () => {
    await runMigrations(db, before44);
    await seedOrg(db);
    await insertLog(db, {
      id: 'log-task',
      subjectType: 'task',
      subjectId: 'task-1',
      kind: 'TaskCreated',
      seq: 1,
      payload: '{"title":"Milk"}',
    });
    await insertLog(db, {
      id: 'log-list',
      subjectType: 'list',
      subjectId: 'list-1',
      kind: 'NamedListCreated',
      seq: 2,
    });
    await insertLog(db, {
      id: 'log-project',
      subjectType: 'project',
      subjectId: 'project-1',
      kind: 'ProjectCreated',
      projectId: 'project-1',
      seq: 3,
    });
    await insertLog(db, {
      id: 'log-note',
      subjectType: 'note',
      subjectId: 'note-1',
      kind: 'NoteCreated',
      seq: 4,
    });
    await insertLog(db, {
      id: 'log-hidden',
      subjectType: 'task',
      subjectId: 'task-2',
      kind: 'TaskPinned',
      actorKind: 'bot',
      hidden: 1,
      seq: 5,
    });
    await insertLog(db, {
      id: 'log-nulls',
      subjectType: 'task',
      subjectId: 'task-3',
      kind: 'TaskCreated',
      projectId: null,
      actorUserId: null,
      actorKind: null,
      seq: 6,
    });

    const savedRows = await rows(db);
    const savedIndexes = await indexShape(db);
    const savedTriggers = await triggers(db);
    const savedForeignKeys = await foreignKeys(db);
    const savedColumns = await columns(db);

    await runMigrations(db, migrations);

    expect(await rows(db)).toEqual(savedRows);
    expect(await indexShape(db)).toEqual(savedIndexes);
    expect(await triggers(db)).toEqual(savedTriggers);
    expect(savedTriggers).toEqual([]);
    expect(await foreignKeys(db)).toEqual(savedForeignKeys);
    expect(savedForeignKeys.map((row) => row.table)).toEqual(['organizations']);
    expect(await columns(db)).toEqual(savedColumns);
    expect(savedIndexes.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_change_log_subject',
        'idx_change_log_org',
        'idx_change_log_org_project',
        'idx_change_log_org_project_visible',
        'idx_change_log_seq',
      ])
    );

    const sql = await tableSql(db);
    expect(sql).toContain("'capture'");
    expect(sql).toContain("'task'");
    expect(sql).toContain("'list'");
    expect(sql).toContain("'project'");
    expect(sql).toContain("'note'");

    const foreignKeyFlag = await db.execute({ sql: 'PRAGMA foreign_keys' });
    expect(foreignKeyFlag.rows[0]?.foreign_keys).toBe(1);

    await insertLog(db, {
      id: 'log-capture',
      subjectType: 'capture',
      subjectId: 'capture-1',
      kind: 'CaptureNoted',
      seq: 7,
    });
    await insertLog(db, {
      id: 'log-task-after',
      subjectType: 'task',
      subjectId: 'task-4',
      kind: 'TaskCreated',
      seq: 8,
    });
    expect((await rows(db)).map((row) => row.id)).toContain('log-capture');

    await expect(
      insertLog(db, {
        id: 'log-bad-subject',
        subjectType: 'notebook',
        subjectId: 'x',
        kind: 'TaskCreated',
        seq: 9,
      })
    ).rejects.toThrow();
    await expect(
      insertLog(db, {
        id: 'log-bad-hidden',
        subjectType: 'task',
        subjectId: 'task-1',
        kind: 'TaskCreated',
        hidden: 2,
        seq: 10,
      })
    ).rejects.toThrow();
    await expect(
      insertLog(db, {
        id: 'log-bad-actor',
        subjectType: 'task',
        subjectId: 'task-1',
        kind: 'TaskCreated',
        actorKind: 'agent',
        seq: 11,
      })
    ).rejects.toThrow();
    await expect(
      insertLog(db, {
        id: 'log-dup-seq',
        subjectType: 'task',
        subjectId: 'task-1',
        kind: 'TaskCreated',
        seq: 1,
      })
    ).rejects.toThrow();
    await expect(
      db.execute({
        sql: `
          INSERT INTO change_log (${COLUMNS})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'log-orphan',
          'org-missing',
          null,
          'task',
          'task-1',
          'TaskCreated',
          1,
          '{}',
          null,
          null,
          '2026-11-07T00:00:00.000Z',
          0,
          12,
        ],
      })
    ).rejects.toThrow();
    expect(await rows(db)).toHaveLength(savedRows.length + 2);
  });

  it('accepts capture and the old subject types on a fresh schema', async () => {
    await runMigrations(db, migrations);
    await seedOrg(db);

    const subjects = ['task', 'list', 'project', 'note', 'capture'] as const;
    for (const [index, subjectType] of subjects.entries()) {
      await insertLog(db, {
        id: `fresh-${subjectType}`,
        subjectType,
        subjectId: `${subjectType}-1`,
        kind: 'TaskCreated',
        seq: index + 1,
      });
    }

    expect((await rows(db)).map((row) => row.subject_type)).toEqual([...subjects]);
    await expect(
      insertLog(db, {
        id: 'fresh-bad',
        subjectType: 'widget',
        subjectId: 'x',
        kind: 'TaskCreated',
        seq: 20,
      })
    ).rejects.toThrow();
  });

  it('rolls the rebuild back when the copied seq values are not unique', async () => {
    await runMigrations(db, before44);
    await seedOrg(db);
    await insertLog(db, {
      id: 'log-one',
      subjectType: 'task',
      subjectId: 'task-1',
      kind: 'TaskCreated',
      seq: 1,
    });
    await db.execute({ sql: 'DROP INDEX idx_change_log_seq' });
    await insertLog(db, {
      id: 'log-two',
      subjectType: 'list',
      subjectId: 'list-1',
      kind: 'NamedListCreated',
      seq: 1,
    });

    await expect(runMigrations(db, migrations)).rejects.toThrow(/Migration 44/);

    expect((await rows(db)).map((row) => row.id).sort()).toEqual(['log-one', 'log-two']);
    const leftover = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE name = 'change_log_new'`,
    });
    expect(leftover.rows).toEqual([]);
    const applied = await db.execute({
      sql: `SELECT version FROM _migrations WHERE version = 44`,
    });
    expect(applied.rows).toEqual([]);
    await expect(
      insertLog(db, {
        id: 'log-capture',
        subjectType: 'capture',
        subjectId: 'capture-1',
        kind: 'CaptureNoted',
        seq: 2,
      })
    ).rejects.toThrow();
  });
});
