/**
 * Local checks for the M0.2 remote runner. Does not open a Turso connection.
 *
 *   pnpm --filter @yoink/api exec tsx ../../docs/architecture/adr/spikes/m0-2-u2-remote-check.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../../../../apps/api/src/platform/database/database.ts';
import { describeLocalError, runU2BatchProof } from './m0-2-u2-batch-proof.ts';
import { PROOF_IDENTITY } from './m0-2-u2-remote-identity.ts';
import {
  AUTHORIZED_GROUP_ID,
  LIBSQL_VERSION,
  REMOTE_HOSTNAME,
  REMOTE_TARGET,
  TOKEN_ENV,
  assertRemoteTarget,
  redactSecrets,
  sanitizeError,
} from './m0-2-u2-remote-guard.ts';
import { executeRemoteProof, readInstalledLibsqlVersion, type SpikeClient } from './m0-2-u2-remote-run.ts';

const spikeDir = new URL('.', import.meta.url);
const repoRoot = new URL('../../../../', import.meta.url);

const fail = (message: string): never => {
  throw new Error(message);
};

const sha256 = (path: URL) => createHash('sha256').update(readFileSync(path)).digest('hex');

const assert = (condition: unknown, message: string) => {
  if (!condition) fail(message);
};

const stripMs = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripMs);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'ms')
        .map(([key, inner]) => [key, stripMs(inner)])
    );
  }
  return value;
};

const checkHashes = () => {
  for (const [relative, expected] of Object.entries(PROOF_IDENTITY.sources)) {
    const actual = sha256(new URL(relative, repoRoot));
    assert(actual === expected, `hash mismatch for ${relative}`);
  }
};

const checkGuard = () => {
  assertRemoteTarget(REMOTE_TARGET);
  const rejected = [
    'libsql://jhtc-yoink-jmhill.aws-us-east-1.turso.io',
    'libsql://yoink-prod-jmhill.aws-us-east-1.turso.io',
    'libsql://user:secret@yoink-m02-spike-jmhill.aws-us-east-1.turso.io',
    'https://yoink-m02-spike-jmhill.aws-us-east-1.turso.io',
    'libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io/db',
    'libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io?authToken=secret',
    'libsql://yoink-m02-spike-jmhill.aws-us-east-2.turso.io',
    'libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io:443',
  ];
  for (const url of rejected) {
    let threw = false;
    try {
      assertRemoteTarget(url);
    } catch {
      threw = true;
    }
    assert(threw, `accepted forbidden url ${url}`);
  }
  const token = 'spike-token-do-not-print';
  const leaked = Object.assign(new Error(`HTTP ${token} libsql://example`), {
    code: 'SERVER_ERROR',
    rawCode: 401,
    cause: Object.assign(new Error(`bearer ${token}`), { code: 'FETCH', rawCode: 0, statementIndex: 4 }),
  });
  const sanitized = sanitizeError(leaked);
  assert(sanitized.code === 'SERVER_ERROR', 'code');
  assert(sanitized.rawCode === 401, 'rawCode');
  assert(sanitized.index === null, 'own index stays null when absent');
  assert(sanitized.cause?.code === 'FETCH', 'cause code');
  assert(sanitized.cause?.index === 4, 'cause index only when present');
  const encoded = JSON.stringify(sanitized);
  assert(!encoded.includes(token), 'sanitizer kept a token');
  assert(!encoded.includes('HTTP'), 'sanitizer kept a message');
  assert(!('message' in sanitized), 'message field');
  const redacted = redactSecrets(`{"error":"${token}"}`, [token]);
  assert(redacted.redacted && !redacted.text.includes(token), 'redact');
  assert(AUTHORIZED_GROUP_ID === '01a1b366-ad01-751d-bbab-7852a143f84b', 'group');
  assert(REMOTE_HOSTNAME === 'yoink-m02-spike-jmhill.aws-us-east-1.turso.io', 'host');
  assert(LIBSQL_VERSION === '0.15.15', 'libsql pin');
  assert(TOKEN_ENV === 'TURSO_SPIKE_AUTH_TOKEN', 'token env name');
  const installed = readInstalledLibsqlVersion(new URL('../../../../apps/api/package.json', import.meta.url).href);
  assert(installed === '0.15.15', `installed libsql ${installed}`);
};

const checkOrchestrator = async () => {
  let calls = 0;
  const missing = await executeRemoteProof({
    token: undefined,
    libsqlVersion: LIBSQL_VERSION,
    createClient: () => {
      calls += 1;
      throw new Error('should not connect');
    },
  });
  assert(missing.exitCode === 1 && calls === 0, 'missing token connected');
  assert(missing.stderr?.includes('MISSING_TOKEN') === true, 'missing token code');

  const wrongVersion = await executeRemoteProof({
    token: 'present-but-unused',
    libsqlVersion: '0.0.0',
    createClient: () => {
      calls += 1;
      throw new Error('should not connect');
    },
  });
  assert(wrongVersion.exitCode === 1 && calls === 0, 'wrong version connected');
  assert(wrongVersion.stderr?.includes('0.0.0') === true, 'version echo');
  assert(!wrongVersion.stderr?.includes('present-but-unused'), 'version path printed token');

  const token = 'remote-proof-token-value';
  const seen: { url?: string; authToken?: string; modes: Array<string | undefined> } = { modes: [] };
  const failing: SpikeClient = {
    execute: async () => {
      throw Object.assign(new Error(`network ${token}`), { code: 'HTTP_BODY', rawCode: 'no-index' });
    },
    batch: async (_queries, mode) => {
      seen.modes.push(mode);
      throw Object.assign(new Error(`batch failed ${token}`), {
        code: `HTTP_BODY ${token}`,
        rawCode: 500,
        cause: { message: token, code: 'CAUSE', rawCode: 7 },
      });
    },
    close: () => undefined,
  };
  const failed = await executeRemoteProof({
    token,
    libsqlVersion: LIBSQL_VERSION,
    nodeVersion: 'v24-test',
    createClient: (config) => {
      calls += 1;
      seen.url = config.url;
      seen.authToken = config.authToken;
      return failing;
    },
  });
  assert(calls === 1, 'createClient count');
  assert(seen.url === REMOTE_TARGET, 'url passed to createClient');
  assert(seen.authToken === token, 'token passed only to createClient');
  assert(seen.modes[0] === 'write', 'first batch mode');
  assert(failed.exitCode === 1, 'http failure exit');
  assert(failed.stdout === null, 'no stdout on failure');
  const stderr = failed.stderr ?? '';
  assert(!stderr.includes(token), 'stderr contained the token');
  assert(!stderr.includes('batch failed'), 'stderr contained the client message');
  const body = JSON.parse(stderr) as {
    error: {
      code: string;
      rawCode: number;
      index: number | null;
      cause: { code: string; rawCode: number; index: number | null };
    };
    secretRedacted?: boolean;
  };
  assert(body.error.code === 'HTTP_BODY [redacted]', 'http code');
  assert(body.error.rawCode === 500, 'http raw');
  assert(body.error.index === null, 'no invented index');
  assert(body.error.cause.code === 'CAUSE' && body.error.cause.rawCode === 7, 'cause allowlist');
  assert(body.error.cause.index === null, 'no invented cause index');
  assert(body.secretRedacted === true, 'redaction flag');
};

const checkLocalEquivalence = async () => {
  const root = mkdtempSync(join(tmpdir(), 'yoink-m0-2-check-'));
  const db = createDatabase({ type: 'file', path: join(root, 'spike.db') });
  try {
    const scenarios = await runU2BatchProof(db, describeLocalError);
    const expected = JSON.parse(readFileSync(new URL('m0-2-u2-batch.local.json', spikeDir), 'utf8')) as Record<string, unknown>;
    delete expected.node;
    delete expected.libsqlClient;
    delete expected.database;
    delete expected.assertionSql;
    delete expected.batchMode;
    delete expected.clientBegin;
    assert(JSON.stringify(stripMs(scenarios)) === JSON.stringify(stripMs(expected)), 'local proof diverged from m0-2-u2-batch.local.json');
  } finally {
    await db.close();
    rmSync(root, { recursive: true, force: true });
  }
};

const checkBundle = () => {
  const bundleUrl = new URL('remote-runner/m0-2-u2-batch.remote.mjs', spikeDir);
  const manifestUrl = new URL('remote-runner/manifest.json', spikeDir);
  const packageUrl = new URL('remote-runner/package.json', spikeDir);
  const bundle = readFileSync(bundleUrl, 'utf8');
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as {
    artifact: Record<string, string>;
    commands: string[];
    libsqlClient: string;
  };
  const lockUrl = new URL('remote-runner/package-lock.json', spikeDir);
  assert(sha256(bundleUrl) === manifest.artifact['m0-2-u2-batch.remote.mjs'], 'bundle checksum');
  assert(sha256(packageUrl) === manifest.artifact['package.json'], 'package checksum');
  assert(sha256(lockUrl) === manifest.artifact['package-lock.json'], 'lock checksum');
  assert(manifest.libsqlClient === '0.15.15', 'manifest libsql');
  assert(manifest.commands.includes('npm install'), 'npm install command');
  assert(manifest.commands.includes('node m0-2-u2-batch.remote.mjs'), 'node command');
  assert(!bundle.includes('TURSO_DATABASE_URL'), 'bundle names the production url env');
  assert(!bundle.includes('TURSO_AUTH_TOKEN'), 'bundle names the production token env');
  assert(!bundle.includes('libsql://jhtc-yoink'), 'bundle connects to the production host');
  assert(!bundle.includes('libsql://yoink-prod'), 'bundle connects to the production database');
  assert(bundle.includes('parsed.hostname.includes("jhtc-yoink")'), 'bundle rejects the production host');
  assert(bundle.includes('parsed.hostname.includes("yoink-prod")'), 'bundle rejects the production database name');
  assert(bundle.includes(REMOTE_TARGET), 'bundle embeds the spike url');
  const createAt = bundle.indexOf('createClient(');
  const hostAt = bundle.indexOf(REMOTE_HOSTNAME);
  const missingAt = bundle.indexOf('MISSING_TOKEN');
  assert(missingAt !== -1 && hostAt !== -1 && createAt !== -1, 'bundle markers');
  assert(missingAt < createAt && hostAt < createAt, 'hostname gate is compiled before createClient');
  const pkg = JSON.parse(readFileSync(packageUrl, 'utf8')) as { dependencies: Record<string, string> };
  assert(pkg.dependencies['@libsql/client'] === '0.15.15', 'package pin');
  assert(!readFileSync(packageUrl, 'utf8').includes('TURSO_'), 'package.json has no token');
};

const main = async () => {
  checkHashes();
  checkGuard();
  await checkOrchestrator();
  await checkLocalEquivalence();
  checkBundle();
  process.stdout.write('m0-2 remote runner checks passed\n');
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'check failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
