import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

const insertRecord = async (
  db: Database,
  input: { id: string; occurredAt: string; kind?: string }
) => {
  await db.execute({
    sql: `
      INSERT INTO change_log (
        id, organization_id, project_id, subject_type, subject_id,
        kind, schema_version, payload_json, actor_user_id, actor_kind,
        occurred_at, hidden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      input.id,
      'org-1',
      'project-1',
      'project',
      'project-1',
      input.kind ?? 'ProjectUpdated',
      1,
      '{}',
      null,
      null,
      input.occurredAt,
      0,
    ],
  });
};

describe('Migration 33: add_change_log_seq', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('backfills seq from rowid so existing insertion order is kept', async () => {
    await runMigrations(
      db,
      migrations.filter((migration) => migration.version < 33)
    );

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2026-10-10T12:00:00.000Z'],
    });

    const sameInstant = '2026-10-11T12:00:00.000Z';
    await insertRecord(db, { id: 'zzzz-later-uuid', occurredAt: sameInstant });
    await insertRecord(db, { id: 'aaaa-earlier-uuid', occurredAt: sameInstant });
    await insertRecord(db, {
      id: 'mmmm-middle-uuid',
      occurredAt: '2026-10-11T11:00:00.000Z',
    });

    const before = await db.execute({
      sql: `SELECT id, rowid FROM change_log ORDER BY rowid ASC`,
    });
    expect(before.rows.map((row) => row.id)).toEqual([
      'zzzz-later-uuid',
      'aaaa-earlier-uuid',
      'mmmm-middle-uuid',
    ]);

    const migration33 = migrations.find((migration) => migration.version === 33);
    expect(migration33).toBeDefined();
    await runMigrations(db, [migration33!]);

    const after = await db.execute({
      sql: `SELECT id, seq, rowid FROM change_log ORDER BY seq ASC`,
    });
    expect(after.rows.map((row) => ({ id: row.id, seq: Number(row.seq) }))).toEqual(
      before.rows.map((row) => ({ id: row.id, seq: Number(row.rowid) }))
    );
  });

  it('adds the visible project timeline index', async () => {
    await runMigrations(db, migrations);

    const indexes = await db.execute({
      sql: `
        SELECT name FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_change_log_org_project_visible'
      `,
    });
    expect(indexes.rows).toHaveLength(1);
  });

  it('adds a unique index on seq', async () => {
    await runMigrations(db, migrations);

    const indexes = await db.execute({
      sql: `
        SELECT name, sql FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_change_log_seq'
      `,
    });
    expect(indexes.rows).toHaveLength(1);
    expect(String(indexes.rows[0]?.sql)).toMatch(/UNIQUE/i);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2026-10-10T12:00:00.000Z'],
    });
    await insertRecord(db, { id: 'first', occurredAt: '2026-10-11T12:00:00.000Z' });
    await db.execute({ sql: `UPDATE change_log SET seq = 1 WHERE id = 'first'` });

    await expect(
      db.execute({
        sql: `
          INSERT INTO change_log (
            id, organization_id, project_id, subject_type, subject_id,
            kind, schema_version, payload_json, actor_user_id, actor_kind,
            occurred_at, hidden, seq
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'duplicate-seq',
          'org-1',
          'project-1',
          'project',
          'project-1',
          'ProjectUpdated',
          1,
          '{}',
          null,
          null,
          '2026-10-11T12:01:00.000Z',
          0,
          1,
        ],
      })
    ).rejects.toThrow();
  });
});
