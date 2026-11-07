/**
 * Local checks for the M0.2 U1 runner. Does not open a Turso connection.
 *
 *   pnpm --filter @yoink/api exec tsx ../../docs/architecture/adr/spikes/m0-2-u1-remote-check.ts
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { U1_IDENTITY } from './m0-2-u1-remote-identity.ts';
import { executeU1RemoteProof, type U1Client } from './m0-2-u1-remote-run.ts';
import {
  TIMEOUT_CALL,
  runU1TransactionProof,
  runWriteTransaction,
  type U1Db,
  type U1Step,
  type U1Tx,
} from './m0-2-u1-transaction-proof.ts';
import { LIBSQL_VERSION, REMOTE_TARGET, TOKEN_ENV, sanitizeError } from './m0-2-u2-remote-guard.ts';

const repoRoot = new URL('../../../../', import.meta.url);
const runnerDir = new URL('./remote-runner-u1/', import.meta.url);

const fail = (message: string): never => {
  throw new Error(message);
};

const assert = (condition: unknown, message: string) => {
  if (!condition) fail(message);
};

const sha256 = (path: URL) => createHash('sha256').update(readFileSync(path)).digest('hex');

const text = (path: URL) => readFileSync(path, 'utf8');

const checkHashes = () => {
  for (const [relative, expected] of Object.entries(U1_IDENTITY.sources)) {
    assert(sha256(new URL(relative, repoRoot)) === expected, `hash mismatch for ${relative}`);
  }
};

const checkSource = () => {
  const proof = text(new URL('./m0-2-u1-transaction-proof.ts', import.meta.url));
  const run = text(new URL('./m0-2-u1-remote-run.ts', import.meta.url));
  const entry = text(new URL('./m0-2-u1-remote.ts', import.meta.url));
  const combined = `${proof}\n${run}\n${entry}`;
  assert(!combined.includes('DROP'), 'U1 source contains DROP');
  assert(!/\bBEGIN\b/.test(combined), 'U1 source contains BEGIN');
  assert(!/TURSO_DATABASE_URL|TURSO_AUTH_TOKEN/.test(combined), 'U1 source reads a production env name');
  assert(!/libsql:\/\/jhtc-yoink|libsql:\/\/yoink-prod/.test(combined), 'U1 source names a forbidden host');
  assert(
    !/\b(?:FROM|INTO|UPDATE|TABLE|JOIN) (?:tasks|captures|change_log|platform_batch_guard|organizations)\b/.test(proof),
    'U1 proof names an unprefixed U2 table',
  );
  assert(proof.includes("client.transaction('write')") || proof.includes('transaction(\'write\')'), 'mode write');
  assert(TIMEOUT_CALL.configuredMs === null && TIMEOUT_CALL.setByRunner === false, 'timeout must stay unset');
};

const packageRoot = (entry: string): string => {
  let dir = join(entry, '..');
  for (let i = 0; i < 6; i += 1) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown };
      if (typeof pkg.name === 'string' && pkg.name.startsWith('@libsql/')) return dir;
    } catch {
      // keep walking
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  fail(`package root not found from ${entry}`);
};

const checkDriverTimeout = () => {
  const require = createRequire(new URL('../../../../apps/api/package.json', import.meta.url).href);
  const clientRoot = packageRoot(require.resolve('@libsql/client'));
  const coreRoot = packageRoot(join(clientRoot, '../core/package.json'));
  const hranaRoot = packageRoot(join(clientRoot, '../hrana-client/package.json'));
  assert(
    JSON.parse(readFileSync(join(coreRoot, 'package.json'), 'utf8')).name === '@libsql/core',
    'core package',
  );
  assert(
    JSON.parse(readFileSync(join(hranaRoot, 'package.json'), 'utf8')).name === '@libsql/hrana-client',
    'hrana package',
  );
  const files = [
    join(coreRoot, 'lib-esm/api.d.ts'),
    join(clientRoot, 'lib-esm/http.js'),
    join(clientRoot, 'lib-esm/sqlite3.js'),
    join(hranaRoot, 'lib-esm/index.js'),
  ];
  for (const file of files) {
    assert(!/timeout/i.test(readFileSync(file, 'utf8')), `timeout appeared in ${file}`);
  }
  const http = readFileSync(join(clientRoot, 'lib-esm/http.js'), 'utf8');
  assert(http.includes('async transaction(mode = "write")'), 'http transaction signature changed');
};

const fakeTx = (behavior: {
  rowsAffected?: number;
  throwOn?: string;
  executeLog: string[];
  calls: { commit: number; rollback: number; close: number };
}): U1Tx => ({
  execute: async (statement) => {
    behavior.executeLog.push(statement.sql);
    if (behavior.throwOn && statement.sql.includes(behavior.throwOn)) throw new Error('boom');
    return { rowsAffected: behavior.rowsAffected ?? 1 };
  },
  commit: async () => {
    behavior.calls.commit += 1;
  },
  rollback: async () => {
    behavior.calls.rollback += 1;
  },
  close: () => {
    behavior.calls.close += 1;
  },
});

const checkControlFlow = async () => {
  const miss = { executeLog: [] as string[], calls: { commit: 0, rollback: 0, close: 0 } };
  const steps: U1Step[] = [
    {
      role: 'task-update',
      owner: 'task-management',
      guarded: true,
      classifyThrow: 'storage',
      sql: 'UPDATE u1_tasks SET title = ?',
    },
    {
      role: 'capture-update',
      owner: 'captures',
      guarded: true,
      classifyThrow: 'storage',
      sql: 'UPDATE u1_captures SET status = ?',
    },
    {
      role: 'history-insert',
      owner: 'history',
      guarded: false,
      classifyThrow: 'storage',
      sql: 'INSERT INTO u1_change_log',
    },
  ];
  const missed = await runWriteTransaction(
    async () =>
      fakeTx({
        ...miss,
        rowsAffected: 1,
        executeLog: miss.executeLog,
      }),
    steps,
    sanitizeError,
    true,
  );
  // The fake above returns 1 for every step. Rebuild with a capture-specific miss.
  assert(missed.committed, 'setup fake should commit when every write matches');

  const logs: string[] = [];
  const calls = { commit: 0, rollback: 0, close: 0 };
  const stale = await runWriteTransaction(
    async () => ({
      execute: async (statement) => {
        logs.push(statement.sql);
        if (statement.sql.startsWith('UPDATE u1_captures')) return { rowsAffected: 0 };
        return { rowsAffected: 1 };
      },
      commit: async () => {
        calls.commit += 1;
      },
      rollback: async () => {
        calls.rollback += 1;
      },
      close: () => {
        calls.close += 1;
      },
    }),
    steps,
    sanitizeError,
    true,
  );
  assert(stale.committed === false, 'guard miss committed');
  assert(stale.commitCalled === false, 'commit after guard miss');
  assert(stale.rollbackCalled && calls.rollback === 1, 'rollback on guard miss');
  assert(stale.closeCalled && calls.close === 1, 'close on guard miss');
  assert(stale.mapped?.kind === 'Conflict' && stale.mapped.owner === 'captures', 'conflict owner');
  assert(stale.mapped?.reason === 'guard-miss' && stale.mapped.source === 'rowsAffected', 'conflict source');
  assert(!logs.some((sql) => sql.startsWith('INSERT')), 'continued after guard miss');
  assert(JSON.stringify(stale.driverError) === 'null', 'guard miss must not invent a driver error');

  const thrownCalls = { commit: 0, rollback: 0, close: 0 };
  const thrown = await runWriteTransaction(
    async () => ({
      execute: async () => {
        const error = new Error('token-must-not-leak UNIQUE constraint failed');
        Object.assign(error, { code: 'SQLITE_CONSTRAINT', rawCode: null, message: 'do not keep' });
        throw error;
      },
      commit: async () => {
        thrownCalls.commit += 1;
      },
      rollback: async () => {
        thrownCalls.rollback += 1;
      },
      close: () => {
        thrownCalls.close += 1;
      },
    }),
    [steps[2]!],
    sanitizeError,
    true,
  );
  assert(thrown.mapped?.kind === 'Storage' && thrown.mapped.owner === 'history', 'storage owner');
  assert(thrown.mapped?.source === 'thrown-execute' && thrown.mapped.reason === 'execute-failed', 'storage source');
  assert(thrown.commitCalled === false && thrownCalls.commit === 0, 'commit after thrown execute');
  assert(thrown.rollbackCalled && thrownCalls.rollback === 1 && thrown.closeCalled, 'rollback and close after throw');
  const driver = thrown.driverError as { code?: unknown; message?: unknown; index?: unknown; rawCode?: unknown };
  assert(driver.code === 'SQLITE_CONSTRAINT' && driver.rawCode === null && driver.index === null, 'allowlisted driver fields');
  assert(!('message' in driver), 'message was kept');

  let executed = 0;
  let threw = false;
  try {
    await runWriteTransaction(
      async () => ({
        execute: async () => {
          executed += 1;
          return { rowsAffected: 0 };
        },
        commit: async () => undefined,
        rollback: async () => undefined,
        close: () => undefined,
      }),
      [{ role: 'read', owner: 'history', guarded: false, classifyThrow: 'storage', sql: 'SELECT 1' }],
      sanitizeError,
      true,
    );
  } catch (error) {
    threw = error instanceof Error && error.message === 'READ_INSIDE_TRANSACTION';
  }
  assert(threw && executed === 0, 'a read reached execute');
};

const fileDb = (file: string): U1Db => {
  const require = createRequire(new URL('../../../../apps/api/package.json', import.meta.url).href);
  const { createClient } = require('@libsql/client') as {
    createClient: (config: { url: string }) => {
      execute: (query: { sql: string; args?: unknown[] }) => Promise<{ rows: unknown; rowsAffected: number }>;
      transaction: (mode: 'write') => Promise<{
        execute: (query: { sql: string; args?: unknown[] }) => Promise<{ rowsAffected: number }>;
        commit: () => Promise<void>;
        rollback: () => Promise<void>;
        close: () => void;
      }>;
      close: () => void;
    };
  };
  const client = createClient({ url: `file:${file}` });
  return {
    execute: async (query) => {
      const result = await client.execute({ sql: query.sql, args: query.args ? [...query.args] : [] });
      return { rows: [...result.rows] as unknown as Record<string, unknown>[] };
    },
    transaction: async (mode) => {
      if (mode !== 'write') throw new Error('U1_MODE');
      const tx = await client.transaction('write');
      return {
        execute: async (query) => {
          const result = await tx.execute({ sql: query.sql, args: query.args ? [...query.args] : [] });
          return { rowsAffected: Number(result.rowsAffected) };
        },
        commit: () => tx.commit(),
        rollback: () => tx.rollback(),
        close: () => {
          tx.close();
        },
      };
    },
    close: () => {
      client.close();
    },
  } as U1Db & { close: () => void };
};

const checkFileProof = async () => {
  const dir = mkdtempSync(join(tmpdir(), 'yoink-u1-'));
  const db = fileDb(join(dir, 'u1.db')) as U1Db & { close: () => void };
  try {
    const proof = await runU1TransactionProof(db, sanitizeError);
    assert(proof.ok === true, 'file proof failed');
    assert(proof.prefix === 'u1_' && proof.semantics === 'once-only', 'prefix semantics');
    assert(proof.manualBegin === false && proof.readsInsideTransaction === false, 'transaction rules');
    const timeout = proof.timeout as { configuredMs: null; setByRunner: false };
    assert(timeout.configuredMs === null && timeout.setByRunner === false, 'file proof claimed a timeout');
    const model = proof.classificationModel as { newModel: boolean; messageParsing: boolean; inventedDriverFields: boolean };
    assert(model.newModel === false && model.messageParsing === false && model.inventedDriverFields === false, 'new model');

    const scenarios = proof.scenarios as Record<string, {
      committed: boolean;
      commitCalled: boolean;
      rollbackCalled: boolean;
      closeCalled: boolean;
      mapped: { kind: string; owner: string; reason: string; source: string } | null;
      steps: Array<{ role: string; rowsAffected: number | null }>;
      snapshot: { taskTitle: string; captureStatus: string; historyCount: number; guardCount: number };
      driverError: { code?: unknown; rawCode?: unknown; index?: unknown; message?: unknown } | null;
    }>;

    const commit = scenarios.commit!;
    assert(commit.committed && commit.commitCalled && commit.rollbackCalled === false, 'commit flags');
    assert(commit.snapshot.taskTitle === 'after' && commit.snapshot.captureStatus === 'processed', 'commit snapshot');
    assert(commit.snapshot.historyCount === 1, 'commit history');
    assert(commit.steps.every((step) => step.rowsAffected === 1), 'commit rowsAffected');

    const stale = scenarios.staleGuard!;
    assert(stale.committed === false && stale.commitCalled === false && stale.rollbackCalled && stale.closeCalled, 'stale flags');
    assert(stale.mapped?.kind === 'Conflict' && stale.mapped.owner === 'captures' && stale.mapped.reason === 'guard-miss', 'stale map');
    assert(stale.mapped?.source === 'rowsAffected', 'stale source');
    assert(stale.steps.at(-1)?.role === 'capture-update' && stale.steps.at(-1)?.rowsAffected === 0, 'stopped at miss');
    assert(!stale.steps.some((step) => step.role === 'history-insert' && step.rowsAffected === null), 'stale shape');
    assert(stale.steps.filter((step) => step.role === 'history-insert').length === 1, 'later history ran');
    assert(stale.snapshot.taskTitle === 'before' && stale.snapshot.historyCount === 0, 'stale rollback snapshot');
    assert(stale.snapshot.captureStatus === 'processed' && stale.snapshot.guardCount === 0, 'stale pre-transaction capture');
    assert(stale.driverError === null, 'stale invented an error');

    const probe = scenarios.checkProbe!;
    assert(probe.committed === false && probe.commitCalled === false && probe.rollbackCalled && probe.closeCalled, 'probe flags');
    assert(probe.mapped === null, 'probe classified from the driver');
    assert(probe.steps.at(-1)?.role === 'guard-check-probe' && probe.steps.at(-1)?.rowsAffected === null, 'probe stopped at check');
    assert(probe.snapshot.taskTitle === 'before' && probe.snapshot.historyCount === 0 && probe.snapshot.guardCount === 0, 'probe rollback');
    assert(typeof probe.driverError?.code === 'string', 'probe code');
    assert(probe.driverError?.rawCode === null || typeof probe.driverError?.rawCode === 'number', 'probe rawCode');
    assert(probe.driverError?.index === null || typeof probe.driverError?.index === 'number', 'probe index');
    assert(!probe.driverError || !('message' in probe.driverError), 'probe message');

    const duplicate = scenarios.duplicatePrimaryKey!;
    assert(duplicate.committed === false && duplicate.commitCalled === false && duplicate.rollbackCalled, 'pk flags');
    assert(duplicate.mapped?.kind === 'Storage' && duplicate.mapped.owner === 'task-management', 'pk map');
    assert(duplicate.mapped?.reason === 'execute-failed' && duplicate.mapped.source === 'thrown-execute', 'pk source');
    assert(duplicate.snapshot.taskTitle === 'before' && duplicate.snapshot.historyCount === 0, 'pk rollback');
    assert(typeof duplicate.driverError?.code === 'string', 'pk code');
    assert(!duplicate.driverError || !('message' in duplicate.driverError), 'pk message');

    const comparison = proof.driverFieldComparison as { usedForClassification: boolean; check: unknown; primaryKey: unknown };
    assert(comparison.usedForClassification === false, 'driver fields used to classify');
    assert(comparison.check !== null && comparison.primaryKey !== null, 'missing driver comparison');

    const again = await runU1TransactionProof(db, sanitizeError);
    assert(again.ok === false && again.code === 'ALREADY_PRESENT' && again.written === false, 'second run wrote');
    const after = await db.execute({ sql: "SELECT title AS value FROM u1_tasks WHERE id = 'task-a'" });
    assert(after.rows[0]?.value === 'before', 'second run changed the task');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
};

const checkRemoteGuards = async () => {
  let calls = 0;
  const missing = await executeU1RemoteProof({
    token: undefined,
    libsqlVersion: LIBSQL_VERSION,
    createClient: () => {
      calls += 1;
      throw new Error('created');
    },
  });
  assert(missing.exitCode === 1 && calls === 0, 'missing token opened a client');
  assert(missing.stderr === `${JSON.stringify({ ok: false, code: 'MISSING_TOKEN' })}\n`, 'missing token payload');

  const wrong = await executeU1RemoteProof({
    token: 'present',
    libsqlVersion: '0.0.0',
    createClient: () => {
      calls += 1;
      throw new Error('created');
    },
  });
  assert(wrong.exitCode === 1 && calls === 0, 'wrong version opened a client');

  const token = 'spike-token-do-not-print';
  const leaked = await executeU1RemoteProof({
    token,
    libsqlVersion: LIBSQL_VERSION,
    createClient: () => {
      calls += 1;
      const error = new Error(`HTTP ${token}`);
      Object.assign(error, { code: token, rawCode: 1 });
      throw error;
    },
  });
  assert(calls === 1, 'createClient was not reached');
  assert(leaked.stdout === null && leaked.stderr !== null && !leaked.stderr.includes(token), 'token leaked');
  assert(leaked.stderr.includes('[redacted]') && leaked.stderr.includes('"secretRedacted": true'), 'redaction flag');
};

const checkBundle = () => {
  const manifest = JSON.parse(text(new URL('./manifest.json', runnerDir))) as {
    artifact: Record<string, string>;
    sources: Record<string, string>;
    commands: string[];
    timeout: { configuredMs: null; setByRunner: false };
    semantics: string;
  };
  for (const [name, expected] of Object.entries(manifest.artifact)) {
    assert(sha256(new URL(name, runnerDir)) === expected, `artifact hash ${name}`);
  }
  for (const [relative, expected] of Object.entries(manifest.sources)) {
    assert(sha256(new URL(relative, repoRoot)) === expected, `manifest source ${relative}`);
  }
  assert(manifest.commands[0] === 'npm ci --ignore-scripts', 'repro install');
  assert(manifest.semantics === 'once-only', 'manifest semantics');
  assert(manifest.timeout.configuredMs === null && manifest.timeout.setByRunner === false, 'manifest timeout');
  const bundle = text(new URL('./m0-2-u1-transaction.remote.mjs', runnerDir));
  assert(!bundle.includes('TURSO_DATABASE_URL') && !bundle.includes('TURSO_AUTH_TOKEN'), 'bundle env');
  assert(!bundle.includes('libsql://jhtc-yoink') && !bundle.includes('libsql://yoink-prod'), 'bundle host');
  assert(!/\bBEGIN\b/.test(bundle), 'bundle BEGIN');
  assert(!bundle.includes('DROP'), 'bundle DROP');
  const createAt = bundle.indexOf('createClient(');
  const missingAt = bundle.indexOf('MISSING_TOKEN');
  const hostAt = bundle.indexOf('yoink-m02-spike-jmhill.aws-us-east-1.turso.io');
  assert(createAt > 0 && missingAt < createAt && hostAt < createAt, 'gates before createClient');
  assert(bundle.includes('transaction("write")') || bundle.includes("transaction('write')"), 'bundled mode');
  const pkg = JSON.parse(text(new URL('./package.json', runnerDir))) as { dependencies: Record<string, string> };
  assert(pkg.dependencies['@libsql/client'] === '0.15.15', 'package pin');
  const lock = text(new URL('./package-lock.json', runnerDir));
  assert(lock.includes('"@libsql/client"') && lock.includes('0.15.15'), 'lock pin');
  assert(process.env[TOKEN_ENV] === undefined, 'token is set in this environment');
};

const cell = (value: unknown): string | number | null => {
  if (typeof value === 'bigint') return Number(value);
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  return null;
};

const checkEvidence = () => {
  const evidenceUrl = new URL('./m0-2-u1-transaction.remote.json', import.meta.url);
  assert(
    sha256(evidenceUrl) === '4944aa9a6c677e0ad1db7beca21b06470938a14e19845953bc554d9195de19b1',
    'remote evidence bytes changed',
  );
  const report = JSON.parse(text(evidenceUrl)) as {
    node: string;
    libsqlClient: string;
    ok: boolean;
    foreignKeys: unknown;
    manualBegin: boolean;
    readsInsideTransaction: boolean;
    durations: { processMs: number; maxTransactionMs: number };
    timeout: { configuredMs: null; setByRunner: boolean };
    driverFieldComparison: { usedForClassification: boolean; allowlistedFieldsEqual: boolean };
    scenarios: Record<string, { ms: number; mapped: { kind?: string; owner?: string } | null; committed: boolean }>;
    source: { sources: Record<string, string> };
  };
  assert(report.ok === true && report.node === 'v22.23.2' && report.libsqlClient === '0.15.15', 'remote header');
  assert(report.foreignKeys === null, 'stored foreignKeys must stay null');
  assert(report.manualBegin === false && report.readsInsideTransaction === false, 'remote rules');
  assert(report.durations.processMs === 7366.9 && report.durations.maxTransactionMs === 481.5, 'remote durations');
  assert(report.timeout.configuredMs === null && report.timeout.setByRunner === false, 'remote timeout');
  assert(report.scenarios.commit?.ms === 406.2 && report.scenarios.commit.committed === true, 'remote commit');
  assert(report.scenarios.staleGuard?.ms === 378.9 && report.scenarios.staleGuard.mapped?.owner === 'captures', 'remote stale');
  assert(report.scenarios.checkProbe?.ms === 481.5 && report.scenarios.checkProbe.mapped === null, 'remote probe');
  assert(
    report.scenarios.duplicatePrimaryKey?.ms === 458.1 && report.scenarios.duplicatePrimaryKey.mapped?.kind === 'Storage',
    'remote primary key',
  );
  assert(
    report.driverFieldComparison.usedForClassification === false && report.driverFieldComparison.allowlistedFieldsEqual === true,
    'remote driver comparison',
  );
  for (const [relative, expected] of Object.entries(report.source.sources)) {
    assert(U1_IDENTITY.sources[relative as keyof typeof U1_IDENTITY.sources] === expected, `evidence source ${relative}`);
  }
  const proof = text(new URL('./m0-2-u1-transaction-proof.ts', import.meta.url));
  assert(proof.includes('result.rows[0]?.value'), 'executed reader column');
  assert(proof.includes("readOutside(db, 'PRAGMA foreign_keys')"), 'pragma read');
  const pragmaRow = { foreign_keys: 1 };
  assert(cell((pragmaRow as { value?: unknown }).value) === null, 'value column is absent');
  assert(cell(pragmaRow.foreign_keys) === 1, 'pragma column is foreign_keys');
  const manifest = JSON.parse(text(new URL('./manifest.json', runnerDir))) as {
    executed: { bundleSha256: string; evidenceSha256: string; foreignKeys: null };
  };
  assert(manifest.executed.foreignKeys === null, 'manifest rewrote foreignKeys');
  assert(
    manifest.executed.bundleSha256 === 'f8c8aef03221fc2a5298157808badc08c2abe260ec6d9e9238eae542c74a47e4',
    'executed bundle sha',
  );
  assert(manifest.executed.evidenceSha256 === sha256(evidenceUrl), 'manifest evidence sha');
};

const main = async () => {
  checkHashes();
  checkSource();
  checkDriverTimeout();
  await checkControlFlow();
  await checkFileProof();
  await checkRemoteGuards();
  checkBundle();
  checkEvidence();
  process.stdout.write('u1-remote-check ok\n');
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
