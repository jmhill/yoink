/**
 * Remote M0.2 proof orchestration. Not a unit of work.
 * The caller passes createClient. This module does not read the environment.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ASSERT_SQL, runU2BatchProof, type SpikeDb, type SpikeResult, type SpikeStatement } from './m0-2-u2-batch-proof.ts';
import {
  AUTHORIZED_GROUP_ID,
  LIBSQL_VERSION,
  REMOTE_HOSTNAME,
  REMOTE_TARGET,
  assertRemoteTarget,
  redactSecrets,
  sanitizeError,
} from './m0-2-u2-remote-guard.ts';
import { PROOF_IDENTITY } from './m0-2-u2-remote-identity.ts';

type ClientResult = {
  rows: Array<Record<string, unknown>>;
  rowsAffected: number;
};

export type SpikeClient = {
  execute: (query: { sql: string; args?: unknown[] }) => Promise<ClientResult>;
  batch: (queries: { sql: string; args?: unknown[] }[], mode?: 'write' | 'read') => Promise<ClientResult[]>;
  close: () => void;
};

export type RemoteCreateClient = (config: { url: string; authToken: string }) => SpikeClient;

export type RemoteRunResult = {
  exitCode: number;
  stdout: string | null;
  stderr: string | null;
};

const toSpikeResult = (result: ClientResult): SpikeResult => ({
  rows: result.rows as Record<string, unknown>[],
  rowsAffected: result.rowsAffected,
});

/**
 * Same mapping as `createDatabase` for `type: 'turso'`:
 * createClient({ url, authToken }) and client.batch(statements, mode).
 */
const adaptClient = (client: SpikeClient): SpikeDb => ({
  execute: async (query) => toSpikeResult(await client.execute({ sql: query.sql, args: query.args ?? [] })),
  batch: async (queries, mode = 'write') => {
    const results = await client.batch(
      queries.map((query: SpikeStatement) => ({ sql: query.sql, args: query.args ?? [] })),
      mode
    );
    return results.map(toSpikeResult);
  },
  close: async () => {
    client.close();
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

export const executeRemoteProof = async (options: {
  token: string | undefined;
  libsqlVersion: string;
  createClient: RemoteCreateClient;
  nodeVersion?: string;
}): Promise<RemoteRunResult> => {
  const token = options.token;
  if (typeof token !== 'string' || token.length === 0) {
    return {
      exitCode: 1,
      stdout: null,
      stderr: `${JSON.stringify({ ok: false, code: 'MISSING_TOKEN' })}\n`,
    };
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

  let client: SpikeClient;
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
        type: 'turso',
        targetUrl: REMOTE_TARGET,
        hostname: REMOTE_HOSTNAME,
        groupId: AUTHORIZED_GROUP_ID,
        temporary: false,
      },
      assertionSql: ASSERT_SQL,
      batchMode: 'write',
      clientBegin: 'BEGIN IMMEDIATE',
      source: PROOF_IDENTITY,
      remoteProof: 'not-claimed-by-runner',
      ...scenarios,
    };
    return { exitCode: 0, stdout: emit(report, [token]), stderr: null };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: null,
      stderr: emit({ ok: false, error: sanitizeError(error) }, [token]),
    };
  } finally {
    await db.close();
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
