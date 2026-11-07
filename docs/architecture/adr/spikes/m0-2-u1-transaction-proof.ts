/**
 * M0.2 U1 proof. Not a unit of work and not production code.
 *
 * Opens transactions only through client.transaction('write'). Never sends a
 * transaction-control statement. Never reads inside a transaction. Never names
 * the U2 tables. A second run refuses once the prefixed tables exist.
 */
import { performance } from 'node:perf_hooks';

export const U1_PREFIX = 'u1_';

const ORG = 'org-spike';
const OCCURRED = '2026-11-06T21:00:00.000Z';

const TASKS = `${U1_PREFIX}tasks`;
const CAPTURES = `${U1_PREFIX}captures`;
const HISTORY = `${U1_PREFIX}change_log`;
const GUARD = `${U1_PREFIX}platform_batch_guard`;
const ORGS = `${U1_PREFIX}organizations`;

const MODULES = ['access', 'captures', 'task-management', 'notes', 'review', 'history'] as const;
type ModuleName = (typeof MODULES)[number];

export type StepOwner = ModuleName | 'platform-guard';

export type U1Statement = { sql: string; args?: readonly unknown[] };

export type U1Step = {
  role: string;
  owner: StepOwner;
  guarded: boolean;
  /** A thrown execute on a probe is recorded and is not classified. */
  classifyThrow: 'storage' | 'probe';
  sql: string;
  args?: readonly unknown[];
};

export type U1Tx = {
  execute: (statement: U1Statement) => Promise<{ rowsAffected: number }>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  close: () => void;
};

export type U1Db = {
  execute: (statement: U1Statement) => Promise<{ rows: ReadonlyArray<Record<string, unknown>> }>;
  transaction: (mode: 'write') => Promise<U1Tx>;
};

export type MappedFailure = {
  kind: 'Conflict' | 'Storage';
  owner: ModuleName;
  reason: 'guard-miss' | 'execute-failed';
  source: 'rowsAffected' | 'thrown-execute';
};

export type StepRecord = {
  role: string;
  owner: StepOwner;
  guarded: boolean;
  rowsAffected: number | null;
  threw: boolean;
};

export type WriteReport = {
  ms: number;
  committed: boolean;
  commitCalled: boolean;
  rollbackCalled: boolean;
  closeCalled: boolean;
  stopOnGuardMiss: boolean;
  mapped: MappedFailure | null;
  driverError: unknown;
  steps: StepRecord[];
};

/**
 * What this runner actually passes. `@libsql/client` 0.15.15 `Config` and
 * `transaction(mode)` have no timeout field. The 5-second sentence in ADR §6.1
 * is not a setting of this call.
 */
export const TIMEOUT_CALL = {
  configuredMs: null,
  setByRunner: false,
  transactionCall: "client.transaction('write')",
  extraArguments: 0,
  createClientKeys: ['url', 'authToken'],
  pinnedClient: '0.15.15',
  pinnedClientConfigHasTimeout: false,
  pinnedTransactionArgumentHasTimeout: false,
} as const;

const SCHEMA: readonly string[] = [
  `CREATE TABLE ${ORGS} (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE ${TASKS} (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES ${ORGS}(id),
    title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE ${CAPTURES} (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES ${ORGS}(id),
    text TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE ${HISTORY} (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES ${ORGS}(id),
    task_id TEXT NOT NULL, kind TEXT NOT NULL, occurred_at TEXT NOT NULL,
    seq INTEGER NOT NULL UNIQUE
  )`,
  `CREATE UNIQUE INDEX ${U1_PREFIX}change_log_seq ON ${HISTORY}(seq)`,
  `CREATE TABLE ${GUARD} (ok INTEGER NOT NULL CHECK (ok = 1))`,
];

const isRead = (sql: string) => /^\s*(select|pragma|with|explain)\b/i.test(sql);

const taskUpdate = (title: string): U1Step => ({
  role: 'task-update',
  owner: 'task-management',
  guarded: true,
  classifyThrow: 'storage',
  sql: `UPDATE ${TASKS} SET title = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
  args: [title, OCCURRED, 'task-a', ORG],
});

const historyInsert = (seq: number): U1Step => ({
  role: 'history-insert',
  owner: 'history',
  guarded: false,
  classifyThrow: 'storage',
  sql: `INSERT INTO ${HISTORY} (id, organization_id, task_id, kind, occurred_at, seq)
        SELECT ?, ${TASKS}.organization_id, ${TASKS}.id, 'retitled', ?, ?
        FROM ${TASKS} WHERE ${TASKS}.id = ? AND ${TASKS}.organization_id = ?`,
  args: [`hist-${seq}`, OCCURRED, seq, 'task-a', ORG],
});

const captureUpdate = (from: string, to: string): U1Step => ({
  role: 'capture-update',
  owner: 'captures',
  guarded: true,
  classifyThrow: 'storage',
  sql: `UPDATE ${CAPTURES} SET status = ?, updated_at = ?
        WHERE id = ? AND organization_id = ? AND status = ?`,
  args: [to, OCCURRED, 'cap-a', ORG, from],
});

const guardProbe: U1Step = {
  role: 'guard-check-probe',
  owner: 'platform-guard',
  guarded: false,
  classifyThrow: 'probe',
  sql: `INSERT INTO ${GUARD} (ok) VALUES (changes() > 0)`,
};

const duplicateTask: U1Step = {
  role: 'duplicate-primary-key',
  owner: 'task-management',
  guarded: false,
  classifyThrow: 'storage',
  sql: `INSERT INTO ${TASKS} (id, organization_id, title, status, created_at, updated_at)
        VALUES (?, ?, 'duplicate', 'open', ?, ?)`,
  args: ['task-a', ORG, OCCURRED, OCCURRED],
};

const cell = (value: unknown): string | number | null => {
  if (typeof value === 'bigint') return Number(value);
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  return null;
};

const moduleOwner = (owner: StepOwner): ModuleName => {
  if (owner === 'platform-guard') throw new Error('GUARD_HAS_NO_MODULE_OWNER');
  return owner;
};

export const runWriteTransaction = async (
  open: () => Promise<U1Tx>,
  steps: readonly U1Step[],
  describeError: (error: unknown) => unknown,
  stopOnGuardMiss: boolean,
): Promise<WriteReport> => {
  const started = performance.now();
  const tx = await open();
  const done: StepRecord[] = [];
  let mapped: MappedFailure | null = null;
  let driverError: unknown = null;
  let committed = false;
  let commitCalled = false;
  let rollbackCalled = false;
  let report: WriteReport | undefined;
  const finish = (partial: Omit<WriteReport, 'ms' | 'closeCalled'>): WriteReport => {
    report = {
      ms: Math.round((performance.now() - started) * 10) / 10,
      closeCalled: false,
      ...partial,
    };
    return report;
  };
  try {
    for (const step of steps) {
      if (isRead(step.sql)) throw new Error('READ_INSIDE_TRANSACTION');
      let rowsAffected: number;
      try {
        const result = await tx.execute({ sql: step.sql, args: step.args });
        rowsAffected = Number(result.rowsAffected);
      } catch (error) {
        done.push({ role: step.role, owner: step.owner, guarded: step.guarded, rowsAffected: null, threw: true });
        driverError = describeError(error);
        if (step.classifyThrow === 'storage') {
          mapped = {
            kind: 'Storage',
            owner: moduleOwner(step.owner),
            reason: 'execute-failed',
            source: 'thrown-execute',
          };
        }
        rollbackCalled = true;
        try {
          await tx.rollback();
        } catch (rollbackError) {
          driverError = { execute: driverError, rollback: describeError(rollbackError) };
        }
        return finish({
          committed,
          commitCalled,
          rollbackCalled,
          stopOnGuardMiss,
          mapped,
          driverError,
          steps: done,
        });
      }
      done.push({ role: step.role, owner: step.owner, guarded: step.guarded, rowsAffected, threw: false });
      if (stopOnGuardMiss && step.guarded && rowsAffected === 0) {
        mapped = { kind: 'Conflict', owner: moduleOwner(step.owner), reason: 'guard-miss', source: 'rowsAffected' };
        rollbackCalled = true;
        try {
          await tx.rollback();
        } catch (rollbackError) {
          driverError = describeError(rollbackError);
        }
        return finish({
          committed,
          commitCalled,
          rollbackCalled,
          stopOnGuardMiss,
          mapped,
          driverError,
          steps: done,
        });
      }
    }
    commitCalled = true;
    await tx.commit();
    committed = true;
    return finish({ committed, commitCalled, rollbackCalled, stopOnGuardMiss, mapped, driverError, steps: done });
  } finally {
    tx.close();
    if (report) report.closeCalled = true;
  }
};

const readOutside = async (db: U1Db, sql: string): Promise<string | number | null> => {
  const result = await db.execute({ sql });
  return cell(result.rows[0]?.value);
};

const snapshot = async (db: U1Db) => ({
  taskTitle: await readOutside(db, `SELECT title AS value FROM ${TASKS} WHERE id = 'task-a'`),
  captureStatus: await readOutside(db, `SELECT status AS value FROM ${CAPTURES} WHERE id = 'cap-a'`),
  historyCount: await readOutside(db, `SELECT COUNT(*) AS value FROM ${HISTORY}`),
  guardCount: await readOutside(db, `SELECT COUNT(*) AS value FROM ${GUARD}`),
});

const resetRows = async (db: U1Db): Promise<void> => {
  await db.execute({ sql: `DELETE FROM ${HISTORY}` });
  await db.execute({ sql: `DELETE FROM ${GUARD}` });
  await db.execute({ sql: `DELETE FROM ${CAPTURES}` });
  await db.execute({ sql: `DELETE FROM ${TASKS}` });
  await db.execute({
    sql: `INSERT INTO ${TASKS} (id, organization_id, title, status, created_at, updated_at)
          VALUES ('task-a', ?, 'before', 'open', ?, ?)`,
    args: [ORG, OCCURRED, OCCURRED],
  });
  await db.execute({
    sql: `INSERT INTO ${CAPTURES} (id, organization_id, text, status, created_at, updated_at)
          VALUES ('cap-a', ?, 'note', 'inbox', ?, ?)`,
    args: [ORG, OCCURRED, OCCURRED],
  });
};

const allowlisted = (error: unknown): { code: unknown; rawCode: unknown; index: unknown } | null => {
  if (!error || typeof error !== 'object') return null;
  const value = error as { code?: unknown; rawCode?: unknown; index?: unknown };
  return { code: value.code ?? null, rawCode: value.rawCode ?? null, index: value.index ?? null };
};

export const runU1TransactionProof = async (
  db: U1Db,
  describeError: (error: unknown) => unknown,
): Promise<Record<string, unknown>> => {
  const started = performance.now();
  const existing = await db.execute({
    sql: `SELECT name AS value FROM sqlite_master WHERE type = 'table' AND name = ?`,
    args: [TASKS],
  });
  if (existing.rows.length > 0) {
    return { ok: false, code: 'ALREADY_PRESENT', prefix: U1_PREFIX, semantics: 'once-only', written: false };
  }

  await db.execute({ sql: 'PRAGMA foreign_keys = ON' });
  for (const sql of SCHEMA) await db.execute({ sql });
  await db.execute({
    sql: `INSERT INTO ${ORGS} (id, name, created_at) VALUES (?, 'Spike', ?)`,
    args: [ORG, OCCURRED],
  });
  const foreignKeys = await readOutside(db, 'PRAGMA foreign_keys');

  await resetRows(db);
  const commit = await runWriteTransaction(
    () => db.transaction('write'),
    [captureUpdate('inbox', 'processed'), taskUpdate('after'), historyInsert(1)],
    describeError,
    true,
  );
  const afterCommit = await snapshot(db);

  await resetRows(db);
  await db.execute({
    sql: `UPDATE ${CAPTURES} SET status = 'processed', updated_at = ? WHERE id = 'cap-a'`,
    args: [OCCURRED],
  });
  const staleGuard = await runWriteTransaction(
    () => db.transaction('write'),
    [taskUpdate('after-should-roll-back'), historyInsert(1), captureUpdate('inbox', 'processed'), historyInsert(2)],
    describeError,
    true,
  );
  const afterStale = await snapshot(db);

  const checkProbe = await runWriteTransaction(
    () => db.transaction('write'),
    [
      taskUpdate('after-should-roll-back'),
      historyInsert(1),
      captureUpdate('inbox', 'processed'),
      guardProbe,
      historyInsert(2),
    ],
    describeError,
    false,
  );
  const afterProbe = await snapshot(db);

  await resetRows(db);
  const duplicate = await runWriteTransaction(
    () => db.transaction('write'),
    [taskUpdate('after-should-roll-back'), historyInsert(1), duplicateTask],
    describeError,
    true,
  );
  const afterDuplicate = await snapshot(db);

  const checkFields = allowlisted(checkProbe.driverError);
  const primaryKeyFields = allowlisted(duplicate.driverError);
  return {
    ok: true,
    mechanism: "client.transaction('write')",
    prefix: U1_PREFIX,
    semantics: 'once-only',
    readsInsideTransaction: false,
    manualBegin: false,
    foreignKeys,
    timeout: TIMEOUT_CALL,
    classificationModel: {
      newModel: false,
      stepFailure: "{ kind: 'Conflict' | 'Storage'; owner: ModuleName; reason: string }",
      conflict: "guarded write rowsAffected === 0; owner is the awaited step",
      storage: 'thrown execute on an ordinary write; owner is the awaited step',
      checkProbe: 'recorded driver error; not a classification input',
      messageParsing: false,
      inventedDriverFields: false,
    },
    scenarios: {
      commit: { ...commit, snapshot: afterCommit },
      staleGuard: { ...staleGuard, snapshot: afterStale },
      checkProbe: { ...checkProbe, snapshot: afterProbe },
      duplicatePrimaryKey: { ...duplicate, snapshot: afterDuplicate },
    },
    driverFieldComparison: {
      usedForClassification: false,
      check: checkFields,
      primaryKey: primaryKeyFields,
      allowlistedFieldsEqual: JSON.stringify(checkFields) === JSON.stringify(primaryKeyFields),
    },
    durations: {
      processMs: Math.round((performance.now() - started) * 10) / 10,
      maxTransactionMs: Math.max(commit.ms, staleGuard.ms, checkProbe.ms, duplicate.ms),
    },
  };
};
