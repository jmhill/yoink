/**
 * CLI entry point for testing pending migrations against production schema.
 *
 * This script:
 * 1. Connects to the production Turso database to query deployed migrations
 * 2. Creates a local SQLite database with the production schema
 * 3. Seeds synthetic test data to exercise FK relationships
 * 4. Runs pending migrations against the seeded data
 * 5. Reports success or failure
 *
 * Usage:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... pnpm tsx src/test-migrations.ts
 *
 * Or via the shell script:
 *   ./scripts/test-migrations.sh
 */

import { createDatabase } from './database/database.js';
import { testPendingMigrations } from './database/migration-test-runner.js';
import { migrations } from './database/migrations/index.js';

const main = async (): Promise<void> => {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl) {
    console.error('Error: TURSO_DATABASE_URL environment variable is required');
    console.error('');
    console.error('Usage:');
    console.error('  TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... pnpm tsx src/test-migrations.ts');
    process.exit(1);
  }

  console.log('Testing pending migrations...');
  console.log(`  Production DB: ${tursoUrl}`);
  console.log('');

  // Connect to production to query deployed migrations
  const productionDb = createDatabase({
    type: 'turso',
    url: tursoUrl,
    authToken: tursoToken,
  });

  const localDbPath = './tmp/migration-test.db';

  try {
    const result = await testPendingMigrations({
      productionDb,
      localDbPath,
      allMigrations: migrations,
    });

    console.log(`Deployed version: ${result.deployedVersion}`);

    if (result.testedMigrations.length === 0) {
      console.log('No pending migrations to test.');
      console.log('');
      console.log('All migrations are already deployed.');
      process.exit(0);
    }

    console.log(`Pending migrations: ${result.testedMigrations.length}`);
    for (const name of result.testedMigrations) {
      console.log(`  - ${name}`);
    }
    console.log('');

    if (result.success) {
      console.log('All pending migrations passed.');
      process.exit(0);
    } else {
      console.error('Migration test FAILED:');
      console.error(`  ${result.error}`);
      console.error('');
      console.error('Fix the migration before deploying.');
      process.exit(1);
    }
  } finally {
    await productionDb.close();
  }
};

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
