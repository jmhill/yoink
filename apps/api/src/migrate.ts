/**
 * CLI entry point for running database migrations.
 *
 * Usage:
 *   pnpm migrate              # Run all pending migrations
 *   DB_PATH=./my.db pnpm migrate  # Specify custom database path
 *
 * Environment variables:
 *   TURSO_DATABASE_URL - Use Turso cloud database
 *   TURSO_AUTH_TOKEN - Auth token for Turso
 *   DB_PATH - Path for local file-based SQLite (default: ./data/captures.db)
 *
 * This should be run as a separate step before starting the application,
 * typically in CI/CD pipelines or as a pre-script for local development.
 */

import { createDatabase } from './database/database.js';
import { runMigrations } from './database/migrator.js';
import { migrations } from './database/migrations.js';
import { getDatabasePath, loadDatabaseConfig } from './config/config.js';

const main = async () => {
  const config = loadDatabaseConfig();
  console.log(`Running migrations on database: ${getDatabasePath(config)}`);

  const database = createDatabase(config);

  try {
    const result = await runMigrations(database, migrations);

    if (result.applied.length === 0) {
      console.log('No new migrations to apply.');
    } else {
      console.log(`Applied ${result.applied.length} migration(s):`);
      result.applied.forEach((name) => console.log(`  ✓ ${name}`));
    }

    if (result.alreadyApplied.length > 0) {
      console.log(`${result.alreadyApplied.length} migration(s) already applied.`);
    }
  } finally {
    await database.close();
  }
};

main();
