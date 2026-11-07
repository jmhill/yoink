/**
 * Standalone entry for the M0.2 U1 remote proof.
 * Not a unit of work. Does not delete the database and does not touch U2 tables.
 *
 * Parent, from a scratch directory that contains this file, package.json, and
 * package-lock.json, with TURSO_SPIKE_AUTH_TOKEN already in the environment
 * (do not put it on the command line):
 *
 *   npm ci --ignore-scripts
 *   node m0-2-u1-transaction.remote.mjs
 *
 * The install does not need the token. The process reads that one variable and
 * never prints it. The only host is
 * libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io. The hostname is
 * checked before createClient.
 *
 * Once-only: if u1_tasks already exists, the process writes nothing and exits
 * with ALREADY_PRESENT. It does not drop or delete U2 tables.
 */
import { createClient } from '@libsql/client';
import { pathToFileURL } from 'node:url';
import { LIBSQL_VERSION, TOKEN_ENV } from './m0-2-u2-remote-guard.ts';
import { executeU1RemoteProof, readInstalledLibsqlVersion, type U1Client } from './m0-2-u1-remote-run.ts';

const isEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

export const main = async () => {
  const token = process.env[TOKEN_ENV];
  let libsqlVersion = '';
  try {
    libsqlVersion = readInstalledLibsqlVersion(import.meta.url);
  } catch {
    process.stderr.write(`${JSON.stringify({ ok: false, code: 'MISSING_LIBSQL', required: LIBSQL_VERSION })}\n`);
    process.exitCode = 1;
    return;
  }
  const result = await executeU1RemoteProof({
    token,
    libsqlVersion,
    nodeVersion: process.version,
    createClient: (config) => createClient(config) as unknown as U1Client,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
};

if (isEntry) {
  main().catch((error: unknown) => {
    const code = error instanceof Error ? error.name : 'FAILED';
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exitCode = 1;
  });
}
