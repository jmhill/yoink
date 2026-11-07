/**
 * Remote M0.2 U1 proof orchestration. Not a unit of work.
 * The caller passes createClient. This module does not read the environment.
 * It does not open the U2 runner and it does not drop tables.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { runU1TransactionProof, TIMEOUT_CALL, type U1Db, type U1Tx } from './m0-2-u1-transaction-proof.ts';
import { U1_IDENTITY } from './m0-2-u1-remote-identity.ts';
import {
  AUTHORIZED_DATABASE_ID,
  LIBSQL_VERSION,
  REMOTE_HOSTNAME,
  REMOTE_TARGET,
  assertRemoteTarget,
  redactSecrets,
  sanitizeError,
} from './m0-2-u2-remote-guard.ts';

type ClientResult = {
  rows: Array<Record<string, unknown>>;
  rowsAffected: number;
};

type RemoteTx = {
  execute: (query: { sql: string; args?: unknown[] }) => Promise<ClientResult>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  close: () => void;
};

export type U1Client = {
  execute: (query: { sql: string; args?: unknown[] }) => Promise<ClientResult>;
  transaction: (mode: 'write') => Promise<RemoteTx>;
  close: () => void;
};

export type U1CreateClient = (config: { url: string; authToken: string }) => U1Client;

export type RemoteRunResult = {
  exitCode: number;
  stdout: string | null;
  stderr: string | null;
};

const adapt = (client: U1Client): U1Db => ({
  execute: async (query) => {
    const result = await client.execute({ sql: query.sql, args: query.args ? [...query.args] : [] });
    return { rows: result.rows };
  },
  transaction: async (mode) => {
    if (mode !== 'write') throw new Error('U1_MODE');
    const tx = await client.transaction('write');
    const adapted: U1Tx = {
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
    return adapted;
  },
});

const emit = (payload: unknown, secrets: readonly string[]): string => {
  const json = JSON.stringify(payload, (_key, value) => (typeof value === 'bigint' ? Number(value) : value), 2);
  const redacted = redactSecrets(json, secrets);
  if (!redacted.redacted) return `${redacted.text}\n`;
  try {
    const parsed = JSON.parse(redacted.text) as Record<string, unknown>;
    parsed.secretRedacted = true;
    const again = redactSecrets(JSON.stringify(parsed, null, 2), secrets);
    if (again.redacted) return `${JSON.stringify({ ok: false, code: 'REDACTION_FAILED', secretRedacted: true })}\n`;
    return `${again.text}\n`;
  } catch {
    return `${JSON.stringify({ ok: false, code: 'REDACTION_FAILED', secretRedacted: true })}\n`;
  }
};

export const executeU1RemoteProof = async (options: {
  token: string | undefined;
  libsqlVersion: string;
  createClient: U1CreateClient;
  nodeVersion?: string;
}): Promise<RemoteRunResult> => {
  const token = options.token;
  if (typeof token !== 'string' || token.length === 0) {
    return { exitCode: 1, stdout: null, stderr: `${JSON.stringify({ ok: false, code: 'MISSING_TOKEN' })}\n` };
  }
  if (options.libsqlVersion !== LIBSQL_VERSION) {
    return {
      exitCode: 1,
      stdout: null,
      stderr: `${JSON.stringify({ ok: false, code: 'LIBSQL_VERSION', found: options.libsqlVersion })}\n`,
    };
  }

  try {
    assertRemoteTarget(REMOTE_TARGET);
  } catch (error) {
    return { exitCode: 1, stdout: null, stderr: emit({ ok: false, error: sanitizeError(error) }, [token]) };
  }

  let client: U1Client;
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
        type: 'turso',
        targetUrl: REMOTE_TARGET,
        hostname: REMOTE_HOSTNAME,
        databaseId: AUTHORIZED_DATABASE_ID,
        temporary: false,
      },
      timeout: TIMEOUT_CALL,
      source: U1_IDENTITY,
      remoteProof: 'not-claimed-by-runner',
      ...proof,
    };
    const failed = proof.ok === false;
    return { exitCode: failed ? 1 : 0, stdout: emit(report, [token]), stderr: null };
  } catch (error) {
    return { exitCode: 1, stdout: null, stderr: emit({ ok: false, error: sanitizeError(error) }, [token]) };
  } finally {
    client.close();
  }
};

export const readInstalledLibsqlVersion = (from: string): string => {
  const require = createRequire(from);
  let dir = dirname(require.resolve('@libsql/client'));
  for (let i = 0; i < 6; i += 1) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown };
      if (pkg.name === '@libsql/client' && typeof pkg.version === 'string') return pkg.version;
    } catch {
      // keep walking toward the package root
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('MISSING_LIBSQL');
};
