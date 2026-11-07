/**
 * Throwaway M0.2 spike. Not a unit of work and not production code.
 *
 * Proves ADR §6.1 U2 against local libsql through `createDatabase`:
 * one `db.batch(..., 'write')`, a platform guard table `CHECK (ok = 1)`,
 * and `INSERT INTO platform_batch_guard (ok) VALUES (changes() > 0)`
 * immediately after each guarded write.
 *
 * Run from the repo root:
 *   pnpm --filter @yoink/api exec tsx ../../docs/architecture/adr/spikes/m0-2-u2-batch.ts
 *
 * The database is a temporary file. It is deleted at the end.
 * This script does not read TURSO_DATABASE_URL or TURSO_SPIKE_AUTH_TOKEN.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../../../../apps/api/src/platform/database/database.ts';
import { ASSERT_SQL, describeLocalError, runU2BatchProof } from './m0-2-u2-batch-proof.ts';

const libsqlVersion = () => {
  const pkg = new URL('../../../../apps/api/node_modules/@libsql/client/package.json', import.meta.url);
  return JSON.parse(readFileSync(pkg, 'utf8')).version as string;
};

export const main = async () => {
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
    Object.assign(report, await runU2BatchProof(db, describeLocalError));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await db.close();
    rmSync(root, { recursive: true, force: true });
  }
};

const isEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(describeLocalError(error), null, 2)}\n`);
    process.exitCode = 1;
  });
}
