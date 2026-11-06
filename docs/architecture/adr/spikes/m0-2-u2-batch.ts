/**
 * Throwaway M0.2 spike. Not a unit of work and not production code.
 *
 * Proves ADR §6.1 U2 against local libsql through `createDatabase`:
 * one `db.batch(..., 'write')`, a platform guard table `CHECK (ok = 1)`,
 * and `INSERT INTO platform_batch_guard (ok) VALUES (changes() > 0)`
 * immediately after each guarded write.
 *
 * Run from the repo root:
 *   pnpm --filter @yoink/api exec tsx docs/architecture/adr/spikes/m0-2-u2-batch.ts
 *
 * The database is a temporary file. It is deleted at the end.
 * This script does not read TURSO_DATABASE_URL.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createDatabase } from '../../../../apps/api/src/platform/database/database.ts';
import type { Database } from '../../../../apps/api/src/platform/database/types.ts';

const ORG = 'org-spike';
const OCCURRED = '2026-11-06T21:00:00.000Z';
const LARGE = 1000;

const ASSERT_SQL = `INSERT INTO platform_batch_guard (ok) VALUES (changes() > 0)`;

type Stmt = { sql: string; args?: unknown[] };

const updateTask = (id: string, title: string): Stmt => ({
  sql: `
    UPDATE tasks SET
      title = ?,
      due_date = ?,
      completed_at = ?,
      pinned_at = ?,
      assignee_id = ?,
      list_id = ?,
      project_id = ?,
      open_order = ?,
      last_changed_at = ?,
      last_changed_by = ?,
      completed_by = ?
    WHERE id = ?
      AND organization_id = ?
      AND deleted_at IS NULL
  `,
  args: [title, null, null, null, null, null, null, 1, OCCURRED, 'user-spike', null, id, ORG],
});

const markCaptureProcessed = (id: string): Stmt => ({
  sql: `
    UPDATE captures SET
      status = 'processed',
      processed_at = ?,
      processed_to_type = ?,
      processed_to_id = ?
    WHERE id = ?
      AND organization_id = ?
      AND status = 'inbox'
      AND deleted_at IS NULL
  `,
  args: [OCCURRED, 'task', 'task-a', id, ORG],
});

const insertHistory = (id: string, subjectId: string): Stmt => ({
  sql: `
    INSERT INTO change_log (
      id, organization_id, project_id, subject_type, subject_id,
      kind, schema_version, payload_json, actor_user_id, actor_kind,
      occurred_at, hidden, seq
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           COALESCE((SELECT MAX(seq) FROM change_log), 0) + 1
    WHERE EXISTS (
      SELECT 1 FROM tasks WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
    )
  `,
  args: [
    id,
    ORG,
    null,
    'task',
    subjectId,
    'TaskUpdated',
    1,
    JSON.stringify({ title: 'after', previousTitle: 'before' }),
    'user-spike',
    'user',
    OCCURRED,
    0,
    subjectId,
    ORG,
  ],
});

const describeError = (error: unknown) => {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) {
    return { thrown: error };
  }
  const value = error as {
    name?: string;
    message?: string;
    code?: unknown;
    rawCode?: unknown;
    cause?: unknown;
  };
  const own = Object.getOwnPropertyNames(error);
  const proto: string[] = [];
  let current: object | null = Object.getPrototypeOf(error);
  while (current && current !== Object.prototype) {
    proto.push(current.constructor?.name ?? '(anonymous)');
    current = Object.getPrototypeOf(current);
  }
  const cause =
    value.cause && typeof value.cause === 'object'
      ? {
          ctor: (value.cause as { constructor?: { name?: string } }).constructor?.name,
          message: (value.cause as { message?: string }).message,
          code: (value.cause as { code?: unknown }).code,
          own: Object.getOwnPropertyNames(value.cause),
        }
      : value.cause;
  return {
    ctor: (error as { constructor?: { name?: string } }).constructor?.name,
    name: value.name,
    message: value.message,
    code: value.code,
    rawCode: value.rawCode,
    own,
    proto,
    cause,
  };
};

const summarizeAffected = (rows: number[] | null) => {
  if (!rows) return null;
  let zeros = 0;
  let sum = 0;
  for (const n of rows) {
    sum += n;
    if (n === 0) zeros += 1;
  }
  return { count: rows.length, sum, zeros, first: rows.slice(0, 8), last: rows.slice(-4) };
};

const tryBatch = async (db: Database, statements: Stmt[]) => {
  const started = performance.now();
  try {
    const results = await db.batch(statements, 'write');
    return {
      ok: true as const,
      ms: Number((performance.now() - started).toFixed(1)),
      statementCount: statements.length,
      rowsAffected: summarizeAffected(results.map((result) => result.rowsAffected)),
      selectRows: results
        .filter((result) => result.rows.length > 0)
        .map((result) => result.rows),
      error: null,
    };
  } catch (error) {
    return {
      ok: false as const,
      ms: Number((performance.now() - started).toFixed(1)),
      statementCount: statements.length,
      rowsAffected: null,
      selectRows: [],
      error: describeError(error),
    };
  }
};

const cell = async (db: Database, sql: string, args?: unknown[]) => {
  const result = await db.execute({ sql, args });
  const row = result.rows[0] ?? {};
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value])
  );
};

const snapshot = (db: Database) =>
  cell(
    db,
    `
      SELECT
        (SELECT title FROM tasks WHERE id = 'task-a') AS task_a_title,
        (SELECT deleted_at FROM tasks WHERE id = 'task-a') AS task_a_deleted,
        (SELECT status FROM captures WHERE id = 'cap-a') AS capture_status,
        (SELECT COUNT(*) FROM change_log) AS history_count,
        (SELECT COUNT(*) FROM platform_batch_guard) AS guard_count,
        (SELECT COALESCE(MIN(ok), -1) FROM platform_batch_guard) AS guard_ok_min,
        (SELECT COALESCE(MAX(ok), -1) FROM platform_batch_guard) AS guard_ok_max
    `
  );

const resetRows = async (db: Database) => {
  await db.batch(
    [
      { sql: `DELETE FROM change_log` },
      { sql: `DELETE FROM platform_batch_guard` },
      { sql: `DELETE FROM tasks` },
      { sql: `DELETE FROM captures` },
      {
        sql: `INSERT INTO tasks (
          id, organization_id, title, open_order, deleted_at
        ) VALUES ('task-a', ?, 'before', 0, NULL)`,
        args: [ORG],
      },
      {
        sql: `INSERT INTO captures (
          id, organization_id, status, deleted_at
        ) VALUES ('cap-a', ?, 'inbox', NULL)`,
        args: [ORG],
      },
    ],
    'write'
  );
};

const libsqlVersion = () => {
  const pkg = new URL(
    '../../../../apps/api/node_modules/@libsql/client/package.json',
    import.meta.url
  );
  return JSON.parse(readFileSync(pkg, 'utf8')).version as string;
};

const main = async () => {
  const root = mkdtempSync(join(tmpdir(), 'yoink-m0-2-u2-'));
  const path = join(root, 'spike.db');
  const db = createDatabase({ type: 'file', path });
  const report: Record<string, unknown> = {
    node: process.version,
    libsqlClient: libsqlVersion(),
    database: { type: 'file', temporary: true },
    assertionSql: ASSERT_SQL,
    batchMode: 'write',
    clientBegin: 'BEGIN IMMEDIATE',
  };

  try {
    await db.batch(
      [
        { sql: `PRAGMA foreign_keys = ON` },
        {
          sql: `CREATE TABLE organizations (id TEXT PRIMARY KEY)`,
        },
        {
          sql: `CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL,
            title TEXT NOT NULL,
            due_date TEXT,
            completed_at TEXT,
            pinned_at TEXT,
            assignee_id TEXT,
            list_id TEXT,
            project_id TEXT,
            open_order INTEGER,
            last_changed_at TEXT,
            last_changed_by TEXT,
            completed_by TEXT,
            deleted_at TEXT,
            FOREIGN KEY (organization_id) REFERENCES organizations(id)
          )`,
        },
        {
          sql: `CREATE TABLE captures (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL,
            status TEXT NOT NULL,
            processed_at TEXT,
            processed_to_type TEXT,
            processed_to_id TEXT,
            deleted_at TEXT,
            FOREIGN KEY (organization_id) REFERENCES organizations(id)
          )`,
        },
        {
          sql: `CREATE TABLE change_log (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL,
            project_id TEXT,
            subject_type TEXT NOT NULL CHECK (subject_type IN ('task', 'list', 'project', 'note')),
            subject_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            actor_user_id TEXT,
            actor_kind TEXT CHECK (actor_kind IS NULL OR actor_kind IN ('user', 'bot')),
            occurred_at TEXT NOT NULL,
            hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
            seq INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (organization_id) REFERENCES organizations(id)
          )`,
        },
        { sql: `CREATE UNIQUE INDEX idx_change_log_seq ON change_log (seq)` },
        {
          sql: `CREATE TABLE platform_batch_guard (
            ok INTEGER NOT NULL CHECK (ok = 1)
          )`,
        },
        { sql: `INSERT INTO organizations (id) VALUES (?)`, args: [ORG] },
      ],
      'write'
    );
    report.foreignKeys = await cell(db, `PRAGMA foreign_keys`);

    await resetRows(db);
    const changesAfterMatch = await tryBatch(db, [
      updateTask('task-a', 'probe-match'),
      { sql: `SELECT changes() AS n` },
    ]);
    const changesAfterMiss = await tryBatch(db, [
      {
        sql: `UPDATE tasks SET title = 'probe-miss' WHERE id = 'missing' AND organization_id = ? AND deleted_at IS NULL`,
        args: [ORG],
      },
      { sql: `SELECT changes() AS n` },
    ]);
    report.changesProbe = {
      afterMatchingUpdate: changesAfterMatch,
      afterMissingUpdate: changesAfterMiss,
      after: await snapshot(db),
    };

    await resetRows(db);
    const committed = await tryBatch(db, [
      markCaptureProcessed('cap-a'),
      { sql: ASSERT_SQL },
      updateTask('task-a', 'after'),
      { sql: ASSERT_SQL },
      insertHistory('hist-a', 'task-a'),
    ]);
    report.commitWhenGuardsMatch = { batch: committed, after: await snapshot(db) };

    await resetRows(db);
    await db.execute({
      sql: `UPDATE captures SET status = 'processed' WHERE id = 'cap-a'`,
    });
    const staleGuard = await tryBatch(db, [
      updateTask('task-a', 'after-should-roll-back'),
      { sql: ASSERT_SQL },
      insertHistory('hist-stale', 'task-a'),
      markCaptureProcessed('cap-a'),
      { sql: ASSERT_SQL },
      insertHistory('hist-after-failure', 'task-a'),
    ]);
    report.staleGuardRollsBackHistoryAndEarlierParticipant = {
      batch: staleGuard,
      after: await snapshot(db),
    };

    await resetRows(db);
    await db.execute({
      sql: `UPDATE tasks SET deleted_at = ? WHERE id = 'task-a'`,
      args: [OCCURRED],
    });
    const staleTask = await tryBatch(db, [
      markCaptureProcessed('cap-a'),
      { sql: ASSERT_SQL },
      insertHistory('hist-before-stale-task', 'task-a'),
      updateTask('task-a', 'after-deleted'),
      { sql: ASSERT_SQL },
    ]);
    report.staleTaskGuardRollsBackCaptureAndHistory = {
      note: 'history INSERT ... WHERE EXISTS matches 0 rows because the task is already deleted, so that statement itself changes nothing. The failing statement is the task assertion.',
      batch: staleTask,
      after: await snapshot(db),
    };

    await resetRows(db);
    const storage = await tryBatch(db, [
      updateTask('task-a', 'after-storage'),
      { sql: ASSERT_SQL },
      insertHistory('hist-storage', 'task-a'),
      {
        sql: `INSERT INTO tasks (id, organization_id, title) VALUES ('task-a', ?, 'duplicate')`,
        args: [ORG],
      },
    ]);
    report.storageFailureRollsBack = { batch: storage, after: await snapshot(db) };

    await resetRows(db);
    const seed: Stmt[] = [];
    for (let i = 0; i < LARGE; i += 1) {
      seed.push({
        sql: `INSERT INTO tasks (id, organization_id, title, open_order) VALUES (?, ?, 'before', ?)`,
        args: [`task-${i}`, ORG, i],
      });
    }
    const seeded = await tryBatch(db, seed);
    const measured: Stmt[] = [];
    for (let i = 0; i < LARGE; i += 1) {
      measured.push(updateTask(`task-${i}`, `after-${i}`));
      measured.push(insertHistory(`hist-${i}`, `task-${i}`));
    }
    const large = await tryBatch(db, measured);
    const largeAfter = await cell(
      db,
      `
        SELECT
          (SELECT COUNT(*) FROM tasks WHERE title LIKE 'after-%') AS retitled,
          (SELECT COUNT(*) FROM change_log) AS history_count,
          (SELECT COUNT(DISTINCT seq) FROM change_log) AS distinct_seq,
          (SELECT MIN(seq) FROM change_log) AS min_seq,
          (SELECT MAX(seq) FROM change_log) AS max_seq
      `
    );
    report.largeBatch = {
      shape: `${LARGE} task updates + ${LARGE} change_log inserts, production column lists, seq = MAX(seq)+1`,
      seed: { ok: seeded.ok, ms: seeded.ms, error: seeded.error },
      batch: large,
      after: largeAfter,
    };

    await db.batch(
      [{ sql: `DELETE FROM change_log` }, { sql: `DELETE FROM platform_batch_guard` }],
      'write'
    );
    await db.execute({ sql: `UPDATE tasks SET title = 'before' WHERE organization_id = ?`, args: [ORG] });
    const guarded: Stmt[] = [];
    for (let i = 0; i < LARGE; i += 1) {
      guarded.push(updateTask(`task-${i}`, `after-${i}`));
      guarded.push({ sql: ASSERT_SQL });
    }
    for (let i = 0; i < LARGE; i += 1) {
      guarded.push(insertHistory(`hist-g-${i}`, `task-${i}`));
    }
    const largeGuarded = await tryBatch(db, guarded);
    report.largeGuardedBatch = {
      shape: `${LARGE} task updates + ${LARGE} assertions + ${LARGE} change_log inserts`,
      statementCount: guarded.length,
      batch: largeGuarded,
      after: await cell(
        db,
        `
          SELECT
            (SELECT COUNT(*) FROM tasks WHERE title LIKE 'after-%') AS retitled,
            (SELECT COUNT(*) FROM change_log) AS history_count,
            (SELECT COUNT(*) FROM platform_batch_guard) AS guard_count,
            (SELECT COUNT(DISTINCT seq) FROM change_log) AS distinct_seq,
            (SELECT MIN(seq) FROM change_log) AS min_seq,
            (SELECT MAX(seq) FROM change_log) AS max_seq
        `
      ),
    };

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await db.close();
    rmSync(root, { recursive: true, force: true });
  }
};

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(describeError(error), null, 2)}\n`);
  process.exitCode = 1;
});
