/* M0.2 U2 remote proof. Not a unit of work. @libsql/client 0.15.15. Reads TURSO_SPIKE_AUTH_TOKEN and never prints it. Host checked before createClient. Does not delete the database. */

// docs/architecture/adr/spikes/m0-2-u2-batch-remote.ts
import { createClient } from "@libsql/client";
import { pathToFileURL } from "node:url";

// docs/architecture/adr/spikes/m0-2-u2-remote-guard.ts
var REMOTE_TARGET = "libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io";
var REMOTE_HOSTNAME = "yoink-m02-spike-jmhill.aws-us-east-1.turso.io";
var AUTHORIZED_GROUP_ID = "01a1b366-ad01-751d-bbab-7852a143f84b";
var LIBSQL_VERSION = "0.15.15";
var TOKEN_ENV = "TURSO_SPIKE_AUTH_TOKEN";
var INDEX_KEYS = ["index", "statementIndex", "stmtIndex", "statement_index"];
var RemoteTargetRejected = class extends Error {
  code = "REMOTE_TARGET_REJECTED";
  constructor() {
    super("REMOTE_TARGET_REJECTED");
    this.name = "RemoteTargetRejected";
  }
};
var assertRemoteTarget = (url) => {
  if (url !== REMOTE_TARGET) throw new RemoteTargetRejected();
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new RemoteTargetRejected();
  }
  if (parsed.protocol !== "libsql:") throw new RemoteTargetRejected();
  if (parsed.username !== "" || parsed.password !== "") throw new RemoteTargetRejected();
  if (parsed.port !== "") throw new RemoteTargetRejected();
  if (parsed.hostname !== REMOTE_HOSTNAME) throw new RemoteTargetRejected();
  if (parsed.pathname !== "" && parsed.pathname !== "/") throw new RemoteTargetRejected();
  if (parsed.search !== "" || parsed.hash !== "") throw new RemoteTargetRejected();
  if (parsed.hostname.includes("jhtc-yoink") || parsed.hostname.includes("yoink-prod")) {
    throw new RemoteTargetRejected();
  }
};
var primitiveCode = (value) => {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
};
var readIndex = (value) => {
  for (const key of INDEX_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = value[key];
    if (typeof found === "number" && Number.isFinite(found)) return found;
  }
  return null;
};
var sanitizeError = (error) => {
  if (error === null || typeof error !== "object" && typeof error !== "function") {
    return { code: null, rawCode: null, index: null, cause: null };
  }
  const value = error;
  const cause = value.cause !== null && (typeof value.cause === "object" || typeof value.cause === "function") ? {
    code: primitiveCode(value.cause.code),
    rawCode: primitiveCode(value.cause.rawCode),
    index: readIndex(value.cause)
  } : null;
  return {
    code: primitiveCode(value.code),
    rawCode: primitiveCode(value.rawCode),
    index: readIndex(error),
    cause
  };
};
var redactSecrets = (text, secrets) => {
  let out = text;
  let redacted = false;
  for (const secret of secrets) {
    if (secret.length === 0 || !out.includes(secret)) continue;
    out = out.split(secret).join("[redacted]");
    redacted = true;
  }
  return { text: out, redacted };
};

// docs/architecture/adr/spikes/m0-2-u2-remote-run.ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// docs/architecture/adr/spikes/m0-2-u2-batch-proof.ts
import { performance } from "node:perf_hooks";
var ORG = "org-spike";
var OCCURRED = "2026-11-06T21:00:00.000Z";
var LARGE = 1e3;
var ASSERT_SQL = `INSERT INTO platform_batch_guard (ok) VALUES (changes() > 0)`;
var updateTask = (id, title) => ({
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
  args: [title, null, null, null, null, null, null, 1, OCCURRED, "user-spike", null, id, ORG]
});
var markCaptureProcessed = (id) => ({
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
  args: [OCCURRED, "task", "task-a", id, ORG]
});
var insertHistory = (id, subjectId) => ({
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
    "task",
    subjectId,
    "TaskUpdated",
    1,
    JSON.stringify({ title: "after", previousTitle: "before" }),
    "user-spike",
    "user",
    OCCURRED,
    0,
    subjectId,
    ORG
  ]
});
var summarizeAffected = (rows) => {
  if (!rows) return null;
  let zeros = 0;
  let sum = 0;
  for (const n of rows) {
    sum += n;
    if (n === 0) zeros += 1;
  }
  return { count: rows.length, sum, zeros, first: rows.slice(0, 8), last: rows.slice(-4) };
};
var tryBatch = async (db, statements, describeError) => {
  const started = performance.now();
  try {
    const results = await db.batch(statements, "write");
    return {
      ok: true,
      ms: Number((performance.now() - started).toFixed(1)),
      statementCount: statements.length,
      rowsAffected: summarizeAffected(results.map((result) => result.rowsAffected)),
      selectRows: results.filter((result) => result.rows.length > 0).map((result) => result.rows),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      ms: Number((performance.now() - started).toFixed(1)),
      statementCount: statements.length,
      rowsAffected: null,
      selectRows: [],
      error: describeError(error)
    };
  }
};
var cell = async (db, sql, args) => {
  const result = await db.execute({ sql, args });
  const row = result.rows[0] ?? {};
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? Number(value) : value])
  );
};
var snapshot = (db) => cell(
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
var resetRows = async (db) => {
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
        args: [ORG]
      },
      {
        sql: `INSERT INTO captures (
          id, organization_id, status, deleted_at
        ) VALUES ('cap-a', ?, 'inbox', NULL)`,
        args: [ORG]
      }
    ],
    "write"
  );
};
var schema = [
  { sql: `PRAGMA foreign_keys = ON` },
  { sql: `CREATE TABLE organizations (id TEXT PRIMARY KEY)` },
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
          )`
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
          )`
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
          )`
  },
  { sql: `CREATE UNIQUE INDEX idx_change_log_seq ON change_log (seq)` },
  {
    sql: `CREATE TABLE platform_batch_guard (
            ok INTEGER NOT NULL CHECK (ok = 1)
          )`
  },
  { sql: `INSERT INTO organizations (id) VALUES (?)`, args: [ORG] }
];
var runU2BatchProof = async (db, describeError) => {
  const report = {};
  await db.batch(schema, "write");
  report.foreignKeys = await cell(db, `PRAGMA foreign_keys`);
  await resetRows(db);
  const changesAfterMatch = await tryBatch(
    db,
    [updateTask("task-a", "probe-match"), { sql: `SELECT changes() AS n` }],
    describeError
  );
  const changesAfterMiss = await tryBatch(
    db,
    [
      {
        sql: `UPDATE tasks SET title = 'probe-miss' WHERE id = 'missing' AND organization_id = ? AND deleted_at IS NULL`,
        args: [ORG]
      },
      { sql: `SELECT changes() AS n` }
    ],
    describeError
  );
  report.changesProbe = {
    afterMatchingUpdate: changesAfterMatch,
    afterMissingUpdate: changesAfterMiss,
    after: await snapshot(db)
  };
  await resetRows(db);
  const committed = await tryBatch(
    db,
    [
      markCaptureProcessed("cap-a"),
      { sql: ASSERT_SQL },
      updateTask("task-a", "after"),
      { sql: ASSERT_SQL },
      insertHistory("hist-a", "task-a")
    ],
    describeError
  );
  report.commitWhenGuardsMatch = { batch: committed, after: await snapshot(db) };
  await resetRows(db);
  await db.execute({
    sql: `UPDATE captures SET status = 'processed' WHERE id = 'cap-a'`
  });
  const staleGuard = await tryBatch(
    db,
    [
      updateTask("task-a", "after-should-roll-back"),
      { sql: ASSERT_SQL },
      insertHistory("hist-stale", "task-a"),
      markCaptureProcessed("cap-a"),
      { sql: ASSERT_SQL },
      insertHistory("hist-after-failure", "task-a")
    ],
    describeError
  );
  report.staleGuardRollsBackHistoryAndEarlierParticipant = {
    batch: staleGuard,
    after: await snapshot(db)
  };
  await resetRows(db);
  await db.execute({
    sql: `UPDATE tasks SET deleted_at = ? WHERE id = 'task-a'`,
    args: [OCCURRED]
  });
  const staleTask = await tryBatch(
    db,
    [
      markCaptureProcessed("cap-a"),
      { sql: ASSERT_SQL },
      insertHistory("hist-before-stale-task", "task-a"),
      updateTask("task-a", "after-deleted"),
      { sql: ASSERT_SQL }
    ],
    describeError
  );
  report.staleTaskGuardRollsBackCaptureAndHistory = {
    note: "history INSERT ... WHERE EXISTS matches 0 rows because the task is already deleted, so that statement itself changes nothing. The failing statement is the task assertion.",
    batch: staleTask,
    after: await snapshot(db)
  };
  await resetRows(db);
  const storage = await tryBatch(
    db,
    [
      updateTask("task-a", "after-storage"),
      { sql: ASSERT_SQL },
      insertHistory("hist-storage", "task-a"),
      {
        sql: `INSERT INTO tasks (id, organization_id, title) VALUES ('task-a', ?, 'duplicate')`,
        args: [ORG]
      }
    ],
    describeError
  );
  report.storageFailureRollsBack = { batch: storage, after: await snapshot(db) };
  await resetRows(db);
  const seed = [];
  for (let i = 0; i < LARGE; i += 1) {
    seed.push({
      sql: `INSERT INTO tasks (id, organization_id, title, open_order) VALUES (?, ?, 'before', ?)`,
      args: [`task-${i}`, ORG, i]
    });
  }
  const seeded = await tryBatch(db, seed, describeError);
  const measured = [];
  for (let i = 0; i < LARGE; i += 1) {
    measured.push(updateTask(`task-${i}`, `after-${i}`));
    measured.push(insertHistory(`hist-${i}`, `task-${i}`));
  }
  const large = await tryBatch(db, measured, describeError);
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
    after: largeAfter
  };
  await db.batch(
    [{ sql: `DELETE FROM change_log` }, { sql: `DELETE FROM platform_batch_guard` }],
    "write"
  );
  await db.execute({ sql: `UPDATE tasks SET title = 'before' WHERE organization_id = ?`, args: [ORG] });
  const guarded = [];
  for (let i = 0; i < LARGE; i += 1) {
    guarded.push(updateTask(`task-${i}`, `after-${i}`));
    guarded.push({ sql: ASSERT_SQL });
  }
  for (let i = 0; i < LARGE; i += 1) {
    guarded.push(insertHistory(`hist-g-${i}`, `task-${i}`));
  }
  const largeGuarded = await tryBatch(db, guarded, describeError);
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
    )
  };
  return report;
};

// docs/architecture/adr/spikes/m0-2-u2-remote-identity.ts
var PROOF_IDENTITY = {
  baseMain: "9e6b2ad32155c7085b10ef43161cbde47dda9ec5",
  libsqlClient: "0.15.15",
  sources: {
    "docs/architecture/adr/spikes/m0-2-u2-batch-proof.ts": "62853d73f32f44e54c6367788fd93ce615e9fd0c638a1406bfe47c7e37e25045",
    "docs/architecture/adr/spikes/m0-2-u2-remote-guard.ts": "7303f68dc7f020e4ac1cd5a3aefeba60ed6ba22aabe5f137e7e65b33f872e282",
    "docs/architecture/adr/spikes/m0-2-u2-remote-run.ts": "a8730613e757cb5781f4aec311130e16f84ac792258275f73aeb14a91cdeba76",
    "docs/architecture/adr/spikes/m0-2-u2-batch-remote.ts": "1f25c7127feec6b723acac89a4a6de8cc873c36ec36ee2fe80761490a4e7697e",
    "docs/architecture/adr/spikes/m0-2-u2-batch.ts": "bba029c2254ada7e6f1046e4d1dfceedab66d4449c327413c984fb0df099047a"
  }
};

// docs/architecture/adr/spikes/m0-2-u2-remote-run.ts
var toSpikeResult = (result) => ({
  rows: result.rows,
  rowsAffected: result.rowsAffected
});
var adaptClient = (client) => ({
  execute: async (query) => toSpikeResult(await client.execute({ sql: query.sql, args: query.args ?? [] })),
  batch: async (queries, mode = "write") => {
    const results = await client.batch(
      queries.map((query) => ({ sql: query.sql, args: query.args ?? [] })),
      mode
    );
    return results.map(toSpikeResult);
  },
  close: async () => {
    client.close();
  }
});
var emit = (payload, secrets) => {
  const json = JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? Number(value) : value, 2);
  const redacted = redactSecrets(json, secrets);
  if (!redacted.redacted) return `${redacted.text}
`;
  try {
    const parsed = JSON.parse(redacted.text);
    parsed.secretRedacted = true;
    const again = redactSecrets(JSON.stringify(parsed, null, 2), secrets);
    if (again.redacted) return `${JSON.stringify({ ok: false, code: "REDACTION_FAILED", secretRedacted: true })}
`;
    return `${again.text}
`;
  } catch {
    return `${JSON.stringify({ ok: false, code: "REDACTION_FAILED", secretRedacted: true })}
`;
  }
};
var executeRemoteProof = async (options) => {
  const token = options.token;
  if (typeof token !== "string" || token.length === 0) {
    return {
      exitCode: 1,
      stdout: null,
      stderr: `${JSON.stringify({ ok: false, code: "MISSING_TOKEN" })}
`
    };
  }
  if (options.libsqlVersion !== LIBSQL_VERSION) {
    return {
      exitCode: 1,
      stdout: null,
      stderr: `${JSON.stringify({ ok: false, code: "LIBSQL_VERSION", found: options.libsqlVersion })}
`
    };
  }
  try {
    assertRemoteTarget(REMOTE_TARGET);
  } catch (error) {
    return { exitCode: 1, stdout: null, stderr: emit({ ok: false, error: sanitizeError(error) }, [token]) };
  }
  let client;
  try {
    client = options.createClient({ url: REMOTE_TARGET, authToken: token });
  } catch (error) {
    return { exitCode: 1, stdout: null, stderr: emit({ ok: false, error: sanitizeError(error) }, [token]) };
  }
  const db = adaptClient(client);
  try {
    const scenarios = await runU2BatchProof(db, sanitizeError);
    const report = {
      node: options.nodeVersion ?? process.version,
      libsqlClient: options.libsqlVersion,
      database: {
        type: "turso",
        targetUrl: REMOTE_TARGET,
        hostname: REMOTE_HOSTNAME,
        groupId: AUTHORIZED_GROUP_ID,
        temporary: false
      },
      assertionSql: ASSERT_SQL,
      batchMode: "write",
      clientBegin: "BEGIN IMMEDIATE",
      source: PROOF_IDENTITY,
      remoteProof: "not-claimed-by-runner",
      ...scenarios
    };
    return { exitCode: 0, stdout: emit(report, [token]), stderr: null };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: null,
      stderr: emit({ ok: false, error: sanitizeError(error) }, [token])
    };
  } finally {
    await db.close();
  }
};
var readInstalledLibsqlVersion = (from) => {
  const require2 = createRequire(from);
  let dir = dirname(require2.resolve("@libsql/client"));
  for (let i = 0; i < 6; i += 1) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (pkg.name === "@libsql/client" && typeof pkg.version === "string") return pkg.version;
    } catch {
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("MISSING_LIBSQL");
};

// docs/architecture/adr/spikes/m0-2-u2-batch-remote.ts
var isEntry = process.argv[1] !== void 0 && import.meta.url === pathToFileURL(process.argv[1]).href;
var main = async () => {
  const token = process.env[TOKEN_ENV];
  let libsqlVersion = "";
  try {
    libsqlVersion = readInstalledLibsqlVersion(import.meta.url);
  } catch {
    process.stderr.write(`${JSON.stringify({ ok: false, code: "MISSING_LIBSQL", required: LIBSQL_VERSION })}
`);
    process.exitCode = 1;
    return;
  }
  const result = await executeRemoteProof({
    token,
    libsqlVersion,
    nodeVersion: process.version,
    createClient: (config) => createClient(config)
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
};
if (isEntry) {
  main().catch(() => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: "RUNNER_FAILED" })}
`);
    process.exitCode = 1;
  });
}
export {
  main
};
