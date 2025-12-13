import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from './migrations.js';

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
 * - Validates that existing migrations haven't changed names (consistency check)
 * - Returns which migrations were applied and which were already applied
 */
export const runMigrations = (
  db: DatabaseSync,
  migrations: Migration[]
): MigrationResult => {
  // Create migrations tracking table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  // Get already applied migrations
  const rows = db.prepare('SELECT version, name FROM _migrations').all() as MigrationRow[];
  const applied = new Map(rows.map((r) => [r.version, r.name]));

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
    migration.up(db);

    // Record as applied
    db.prepare(
      'INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)'
    ).run(migration.version, migration.name, new Date().toISOString());

    result.applied.push(migration.name);
  }

  return result;
};
