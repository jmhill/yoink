import type { Database } from './types.js';
import type { Migration } from './types.js';

export type MigrationResult = {
  applied: string[];
  alreadyApplied: string[];
};

type MigrationRow = {
  version: number;
  name: string;
};

/**
 * Run pending database migrations.
 *
 * - Creates a _migrations table to track applied migrations
 * - Applies migrations in order by version number
 * - Each migration runs atomically (using batch for single-statement migrations)
 * - Validates that existing migrations haven't changed names (consistency check)
 * - Returns which migrations were applied and which were already applied
 *
 * Note: For Turso HTTP connections, raw SQL transactions (BEGIN/COMMIT/ROLLBACK)
 * don't work because each execute() is a separate HTTP request. Migrations that
 * need transactional behavior should use db.batch() internally.
 */
export const runMigrations = async (
  db: Database,
  migrations: Migration[]
): Promise<MigrationResult> => {
  // Create migrations tracking table if it doesn't exist
  await db.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `,
  });

  // Get already applied migrations
  const { rows } = await db.execute({
    sql: 'SELECT version, name FROM _migrations',
  });
  const applied = new Map(
    (rows as MigrationRow[]).map((r) => [r.version, r.name])
  );

  const result: MigrationResult = {
    applied: [],
    alreadyApplied: [],
  };

  // Sort migrations by version to ensure consistent order
  const sortedMigrations = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of sortedMigrations) {
    const existingName = applied.get(migration.version);

    if (existingName !== undefined) {
      // Migration already applied - verify consistency
      if (existingName !== migration.name) {
        throw new Error(
          `Migration version ${migration.version} was previously applied as "${existingName}" ` +
            `but is now named "${migration.name}". Migration history is inconsistent.`
        );
      }
      result.alreadyApplied.push(migration.name);
      continue;
    }

    // Apply the migration
    // Note: Each migration.up() is responsible for its own transactional behavior.
    // For complex migrations (table rebuilds), use db.batch() which provides
    // atomic execution over HTTP connections.
    try {
      await migration.up(db);

      // Record as applied
      await db.execute({
        sql: 'INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)',
        args: [migration.version, migration.name, new Date().toISOString()],
      });

      result.applied.push(migration.name);
    } catch (error) {
      // Re-throw with migration context
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
};
