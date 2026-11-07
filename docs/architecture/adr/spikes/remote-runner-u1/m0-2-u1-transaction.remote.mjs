// docs/architecture/adr/spikes/m0-2-u1-remote.ts
import { createClient } from "@libsql/client";
import { pathToFileURL } from "node:url";

// docs/architecture/adr/spikes/m0-2-u2-remote-guard.ts
var REMOTE_TARGET = "libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io";
var REMOTE_HOSTNAME = "yoink-m02-spike-jmhill.aws-us-east-1.turso.io";
var AUTHORIZED_DATABASE_ID = "01a1b366-ad01-751d-bbab-7852a143f84b";
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

// docs/architecture/adr/spikes/m0-2-u1-remote-run.ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// docs/architecture/adr/spikes/m0-2-u1-transaction-proof.ts
import { performance } from "node:perf_hooks";
var U1_PREFIX = "u1_";
var ORG = "org-spike";
var OCCURRED = "2026-11-06T21:00:00.000Z";
var TASKS = `${U1_PREFIX}tasks`;
var CAPTURES = `${U1_PREFIX}captures`;
var HISTORY = `${U1_PREFIX}change_log`;
var GUARD = `${U1_PREFIX}platform_batch_guard`;
var ORGS = `${U1_PREFIX}organizations`;
var TIMEOUT_CALL = {
  configuredMs: null,
  setByRunner: false,
  transactionCall: "client.transaction('write')",
  extraArguments: 0,
  createClientKeys: ["url", "authToken"],
  pinnedClient: "0.15.15",
  pinnedClientConfigHasTimeout: false,
  pinnedTransactionArgumentHasTimeout: false
};
var SCHEMA = [
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
  `CREATE TABLE ${GUARD} (ok INTEGER NOT NULL CHECK (ok = 1))`
];
var isRead = (sql) => /^\s*(select|pragma|with|explain)\b/i.test(sql);
var taskUpdate = (title) => ({
  role: "task-update",
  owner: "task-management",
  guarded: true,
  classifyThrow: "storage",
  sql: `UPDATE ${TASKS} SET title = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
  args: [title, OCCURRED, "task-a", ORG]
});
var historyInsert = (seq) => ({
  role: "history-insert",
  owner: "history",
  guarded: false,
  classifyThrow: "storage",
  sql: `INSERT INTO ${HISTORY} (id, organization_id, task_id, kind, occurred_at, seq)
        SELECT ?, ${TASKS}.organization_id, ${TASKS}.id, 'retitled', ?, ?
        FROM ${TASKS} WHERE ${TASKS}.id = ? AND ${TASKS}.organization_id = ?`,
  args: [`hist-${seq}`, OCCURRED, seq, "task-a", ORG]
});
var captureUpdate = (from, to) => ({
  role: "capture-update",
  owner: "captures",
  guarded: true,
  classifyThrow: "storage",
  sql: `UPDATE ${CAPTURES} SET status = ?, updated_at = ?
        WHERE id = ? AND organization_id = ? AND status = ?`,
  args: [to, OCCURRED, "cap-a", ORG, from]
});
var guardProbe = {
  role: "guard-check-probe",
  owner: "platform-guard",
  guarded: false,
  classifyThrow: "probe",
  sql: `INSERT INTO ${GUARD} (ok) VALUES (changes() > 0)`
};
var duplicateTask = {
  role: "duplicate-primary-key",
  owner: "task-management",
  guarded: false,
  classifyThrow: "storage",
  sql: `INSERT INTO ${TASKS} (id, organization_id, title, status, created_at, updated_at)
        VALUES (?, ?, 'duplicate', 'open', ?, ?)`,
  args: ["task-a", ORG, OCCURRED, OCCURRED]
};
var cell = (value) => {
  if (typeof value === "bigint") return Number(value);
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  return null;
};
var moduleOwner = (owner) => {
  if (owner === "platform-guard") throw new Error("GUARD_HAS_NO_MODULE_OWNER");
  return owner;
};
var runWriteTransaction = async (open, steps, describeError, stopOnGuardMiss) => {
  const started = performance.now();
  const tx = await open();
  const done = [];
  let mapped = null;
  let driverError = null;
  let committed = false;
  let commitCalled = false;
  let rollbackCalled = false;
  let report;
  const finish = (partial) => {
    report = {
      ms: Math.round((performance.now() - started) * 10) / 10,
      closeCalled: false,
      ...partial
    };
    return report;
  };
  try {
    for (const step of steps) {
      if (isRead(step.sql)) throw new Error("READ_INSIDE_TRANSACTION");
      let rowsAffected;
      try {
        const result = await tx.execute({ sql: step.sql, args: step.args });
        rowsAffected = Number(result.rowsAffected);
      } catch (error) {
        done.push({ role: step.role, owner: step.owner, guarded: step.guarded, rowsAffected: null, threw: true });
        driverError = describeError(error);
        if (step.classifyThrow === "storage") {
          mapped = {
            kind: "Storage",
            owner: moduleOwner(step.owner),
            reason: "execute-failed",
            source: "thrown-execute"
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
          steps: done
        });
      }
      done.push({ role: step.role, owner: step.owner, guarded: step.guarded, rowsAffected, threw: false });
      if (stopOnGuardMiss && step.guarded && rowsAffected === 0) {
        mapped = { kind: "Conflict", owner: moduleOwner(step.owner), reason: "guard-miss", source: "rowsAffected" };
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
          steps: done
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
var readOutside = async (db, sql) => {
  const result = await db.execute({ sql });
  return cell(result.rows[0]?.value);
};
var snapshot = async (db) => ({
  taskTitle: await readOutside(db, `SELECT title AS value FROM ${TASKS} WHERE id = 'task-a'`),
  captureStatus: await readOutside(db, `SELECT status AS value FROM ${CAPTURES} WHERE id = 'cap-a'`),
  historyCount: await readOutside(db, `SELECT COUNT(*) AS value FROM ${HISTORY}`),
  guardCount: await readOutside(db, `SELECT COUNT(*) AS value FROM ${GUARD}`)
});
var resetRows = async (db) => {
  await db.execute({ sql: `DELETE FROM ${HISTORY}` });
  await db.execute({ sql: `DELETE FROM ${GUARD}` });
  await db.execute({ sql: `DELETE FROM ${CAPTURES}` });
  await db.execute({ sql: `DELETE FROM ${TASKS}` });
  await db.execute({
    sql: `INSERT INTO ${TASKS} (id, organization_id, title, status, created_at, updated_at)
          VALUES ('task-a', ?, 'before', 'open', ?, ?)`,
    args: [ORG, OCCURRED, OCCURRED]
  });
  await db.execute({
    sql: `INSERT INTO ${CAPTURES} (id, organization_id, text, status, created_at, updated_at)
          VALUES ('cap-a', ?, 'note', 'inbox', ?, ?)`,
    args: [ORG, OCCURRED, OCCURRED]
  });
};
var allowlisted = (error) => {
  if (!error || typeof error !== "object") return null;
  const value = error;
  return { code: value.code ?? null, rawCode: value.rawCode ?? null, index: value.index ?? null };
};
var runU1TransactionProof = async (db, describeError) => {
  const started = performance.now();
  const existing = await db.execute({
    sql: `SELECT name AS value FROM sqlite_master WHERE type = 'table' AND name = ?`,
    args: [TASKS]
  });
  if (existing.rows.length > 0) {
    return { ok: false, code: "ALREADY_PRESENT", prefix: U1_PREFIX, semantics: "once-only", written: false };
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  for (const sql of SCHEMA) await db.execute({ sql });
  await db.execute({
    sql: `INSERT INTO ${ORGS} (id, name, created_at) VALUES (?, 'Spike', ?)`,
    args: [ORG, OCCURRED]
  });
  const foreignKeys = await readOutside(db, "PRAGMA foreign_keys");
  await resetRows(db);
  const commit = await runWriteTransaction(
    () => db.transaction("write"),
    [captureUpdate("inbox", "processed"), taskUpdate("after"), historyInsert(1)],
    describeError,
    true
  );
  const afterCommit = await snapshot(db);
  await resetRows(db);
  await db.execute({
    sql: `UPDATE ${CAPTURES} SET status = 'processed', updated_at = ? WHERE id = 'cap-a'`,
    args: [OCCURRED]
  });
  const staleGuard = await runWriteTransaction(
    () => db.transaction("write"),
    [taskUpdate("after-should-roll-back"), historyInsert(1), captureUpdate("inbox", "processed"), historyInsert(2)],
    describeError,
    true
  );
  const afterStale = await snapshot(db);
  const checkProbe = await runWriteTransaction(
    () => db.transaction("write"),
    [
      taskUpdate("after-should-roll-back"),
      historyInsert(1),
      captureUpdate("inbox", "processed"),
      guardProbe,
      historyInsert(2)
    ],
    describeError,
    false
  );
  const afterProbe = await snapshot(db);
  await resetRows(db);
  const duplicate = await runWriteTransaction(
    () => db.transaction("write"),
    [taskUpdate("after-should-roll-back"), historyInsert(1), duplicateTask],
    describeError,
    true
  );
  const afterDuplicate = await snapshot(db);
  const checkFields = allowlisted(checkProbe.driverError);
  const primaryKeyFields = allowlisted(duplicate.driverError);
  return {
    ok: true,
    mechanism: "client.transaction('write')",
    prefix: U1_PREFIX,
    semantics: "once-only",
    readsInsideTransaction: false,
    manualBegin: false,
    foreignKeys,
    timeout: TIMEOUT_CALL,
    classificationModel: {
      newModel: false,
      stepFailure: "{ kind: 'Conflict' | 'Storage'; owner: ModuleName; reason: string }",
      conflict: "guarded write rowsAffected === 0; owner is the awaited step",
      storage: "thrown execute on an ordinary write; owner is the awaited step",
      checkProbe: "recorded driver error; not a classification input",
      messageParsing: false,
      inventedDriverFields: false
    },
    scenarios: {
      commit: { ...commit, snapshot: afterCommit },
      staleGuard: { ...staleGuard, snapshot: afterStale },
      checkProbe: { ...checkProbe, snapshot: afterProbe },
      duplicatePrimaryKey: { ...duplicate, snapshot: afterDuplicate }
    },
    driverFieldComparison: {
      usedForClassification: false,
      check: checkFields,
      primaryKey: primaryKeyFields,
      allowlistedFieldsEqual: JSON.stringify(checkFields) === JSON.stringify(primaryKeyFields)
    },
    durations: {
      processMs: Math.round((performance.now() - started) * 10) / 10,
      maxTransactionMs: Math.max(commit.ms, staleGuard.ms, checkProbe.ms, duplicate.ms)
    }
  };
};

// docs/architecture/adr/spikes/m0-2-u1-remote-identity.ts
var U1_IDENTITY = {
  baseMain: "9e6b2ad32155c7085b10ef43161cbde47dda9ec5",
  libsqlClient: "0.15.15",
  sources: {
    "docs/architecture/adr/spikes/m0-2-u1-transaction-proof.ts": "2b1530d1c58ab612aacc819b0e19d918ced7a74f69fce9b30ed61243cadff583",
    "docs/architecture/adr/spikes/m0-2-u1-remote-run.ts": "ed323f66aee0de91921c38e533ee3dcba2e484818cead8a70abaf127934525d3",
    "docs/architecture/adr/spikes/m0-2-u1-remote.ts": "6e0aaed6419e418bb6d2e0bdc31bcf8c96e04066facd5a81b9c3a9b9339aaeb6",
    "docs/architecture/adr/spikes/m0-2-u2-remote-guard.ts": "ebfd542db5949cd94edd0c36cd3ae330cd222ef108b521d99ca025fecbcae92a"
  }
};

// docs/architecture/adr/spikes/m0-2-u1-remote-run.ts
var adapt = (client) => ({
  execute: async (query) => {
    const result = await client.execute({ sql: query.sql, args: query.args ? [...query.args] : [] });
    return { rows: result.rows };
  },
  transaction: async (mode) => {
    if (mode !== "write") throw new Error("U1_MODE");
    const tx = await client.transaction("write");
    const adapted = {
      execute: async (query) => {
        const result = await tx.execute({ sql: query.sql, args: query.args ? [...query.args] : [] });
        return { rowsAffected: Number(result.rowsAffected) };
      },
      commit: () => tx.commit(),
      rollback: () => tx.rollback(),
      close: () => {
        tx.close();
      }
    };
    return adapted;
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
var executeU1RemoteProof = async (options) => {
  const token = options.token;
  if (typeof token !== "string" || token.length === 0) {
    return { exitCode: 1, stdout: null, stderr: `${JSON.stringify({ ok: false, code: "MISSING_TOKEN" })}
` };
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
  const db = adapt(client);
  try {
    const proof = await runU1TransactionProof(db, sanitizeError);
    const report = {
      node: options.nodeVersion ?? process.version,
      libsqlClient: options.libsqlVersion,
      database: {
        type: "turso",
        targetUrl: REMOTE_TARGET,
        hostname: REMOTE_HOSTNAME,
        databaseId: AUTHORIZED_DATABASE_ID,
        temporary: false
      },
      timeout: TIMEOUT_CALL,
      source: U1_IDENTITY,
      remoteProof: "not-claimed-by-runner",
      ...proof
    };
    const failed = proof.ok === false;
    return { exitCode: failed ? 1 : 0, stdout: emit(report, [token]), stderr: null };
  } catch (error) {
    return { exitCode: 1, stdout: null, stderr: emit({ ok: false, error: sanitizeError(error) }, [token]) };
  } finally {
    client.close();
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

// docs/architecture/adr/spikes/m0-2-u1-remote.ts
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
  const result = await executeU1RemoteProof({
    token,
    libsqlVersion,
    nodeVersion: process.version,
    createClient: (config) => createClient(config)
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
};
if (isEntry) {
  main().catch((error) => {
    const code = error instanceof Error ? error.name : "FAILED";
    process.stderr.write(`${JSON.stringify({ ok: false, code })}
`);
    process.exitCode = 1;
  });
}
export {
  main
};
