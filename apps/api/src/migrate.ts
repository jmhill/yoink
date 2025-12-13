/**
 * CLI entry point for running database migrations.
 *
 * Usage:
 *   pnpm migrate              # Run all pending migrations
 *   DB_PATH=./my.db pnpm migrate  # Specify custom database path
 *
 * This should be run as a separate step before starting the application,
 * typically in CI/CD pipelines or as a pre-script for local development.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDatabase } from './database/database.js';
import { runMigrations } from './database/migrator.js';
import { migrations } from './database/migrations.js';
import type { DatabaseConfig } from './config/schema.js';

const main = () => {
  const dbPath = process.env.DB_PATH ?? './data/captures.db';

  console.log(`Running migrations on database: ${dbPath}`);

  // Ensure database directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const config: DatabaseConfig = {
    type: 'sqlite',
    path: dbPath,
  };

  const database = createDatabase(config);

  try {
    const result = runMigrations(database.db, migrations);

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
    database.close();
  }
};

main();
