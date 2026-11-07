/**
 * Standalone entry for the M0.2 remote proof.
 * Not a unit of work. Does not delete the database.
 *
 * Parent, from a scratch directory that contains this file and package.json,
 * with TURSO_SPIKE_AUTH_TOKEN already in the environment (do not put it on
 * the command line):
 *
 *   npm install
 *   node m0-2-u2-batch.remote.mjs
 *
 * The process reads that one variable and never prints it. The only host is
 * libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io. The hostname is
 * checked before createClient.
 */
import { createClient } from '@libsql/client';
import { pathToFileURL } from 'node:url';
import { LIBSQL_VERSION, TOKEN_ENV } from './m0-2-u2-remote-guard.ts';
import { executeRemoteProof, readInstalledLibsqlVersion, type SpikeClient } from './m0-2-u2-remote-run.ts';

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
  const result = await executeRemoteProof({
    token,
    libsqlVersion,
    nodeVersion: process.version,
    createClient: (config) => createClient(config) as unknown as SpikeClient,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
};

if (isEntry) {
  main().catch(() => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: 'RUNNER_FAILED' })}\n`);
    process.exitCode = 1;
  });
}
