import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDatabase } from './database.js';
import { runMigrations } from './migrator.js';
import { tursoLikeDatabase } from './turso-like-database.js';
import { getLastDeployedVersion } from './turso-client.js';
import type { Database, Migration } from './types.js';

/**
 * Result of testing pending migrations.
 */
export type MigrationTestResult = {
  success: boolean;
  deployedVersion: number;
  testedMigrations: string[];
  error?: string;
};

/**
 * Options for testing pending migrations.
 */
export type TestMigrationOptions = {
  /** Database to query for deployed migrations (production or test) */
  productionDb: Database;
  /** Path for the local test database file */
  localDbPath: string;
  /** All migrations defined in the codebase */
  allMigrations: Migration[];
  /** Whether to seed test data (default: true) */
  seedData?: boolean;
  /**
   * Rows to insert after the deployed migrations and before the pending ones.
   * The platform runner does not import the test helper. Callers that want
   * the synthetic rows pass `seedMigrationTestData`. Seed errors are ignored
   * so an early schema can still exercise the pending migration.
   */
  seed?: (db: Database) => Promise<unknown>;
  /**
   * Default true. The local database drops a standalone
   * `PRAGMA foreign_keys = OFF` and turns foreign keys on at the start of
   * every `batch`, matching Turso HTTP. `migrate` still runs for real.
   * Pass false only when a test has to change foreign keys on that
   * connection, and say why at the call. The production database is only
   * read for the deployed version.
   */
  tursoLike?: boolean;
};

/**
 * Test pending migrations against a local database with seeded data.
 *
 * This function:
 * 1. Queries the production database to find deployed migration version
 * 2. Creates a fresh local SQLite file
 * 3. Runs all deployed migrations (1..N)
 * 4. Seeds synthetic test data
 * 5. Runs pending migrations (N+1..latest)
 * 6. Reports success or failure
 *
 * This catches migration failures that only occur when tables have data
 * with foreign key relationships (like our migration 20 failure).
 */
export const testPendingMigrations = async (
  options: TestMigrationOptions
): Promise<MigrationTestResult> => {
  const {
    productionDb,
    localDbPath,
    allMigrations,
    seedData = true,
    seed,
    tursoLike = true,
  } = options;

  // 1. Query production for deployed version
  const deployedVersion = await getLastDeployedVersion(productionDb);

  // 2. Split migrations into deployed vs pending
  const sortedMigrations = [...allMigrations].sort(
    (a, b) => a.version - b.version
  );
  const deployedMigrations = sortedMigrations.filter(
    (m) => m.version <= deployedVersion
  );
  const pendingMigrations = sortedMigrations.filter(
    (m) => m.version > deployedVersion
  );

  // If no pending migrations, nothing to test
  if (pendingMigrations.length === 0) {
    return {
      success: true,
      deployedVersion,
      testedMigrations: [],
    };
  }

  // 3. Create fresh local database
  // Clean up any existing file first
  if (existsSync(localDbPath)) {
    rmSync(localDbPath);
  }
  mkdirSync(dirname(localDbPath), { recursive: true });

  const fileDb = createDatabase({ type: 'file', path: localDbPath });
  const localDb = tursoLike ? tursoLikeDatabase(fileDb) : fileDb;

  try {
    // 4. Run deployed migrations
    if (deployedMigrations.length > 0) {
      await runMigrations(localDb, deployedMigrations);
    }

    // 5. Seed test data (only if we have deployed migrations to seed against)
    if (seedData && deployedMigrations.length > 0 && seed) {
      try {
        await seed(localDb);
      } catch {
        // Seeding might fail if schema doesn't support it (e.g., missing tables)
        // This is okay - it means we're testing early migrations
      }
    }

    // 6. Run pending migrations
    await runMigrations(localDb, pendingMigrations);

    return {
      success: true,
      deployedVersion,
      testedMigrations: pendingMigrations.map((m) => m.name),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      deployedVersion,
      testedMigrations: pendingMigrations.map((m) => m.name),
      error: errorMessage,
    };
  } finally {
    await localDb.close();
  }
};
