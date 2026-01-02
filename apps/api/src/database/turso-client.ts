import type { Database } from './types.js';

/**
 * Information about a deployed migration.
 */
export type DeployedMigration = {
  version: number;
  name: string;
  appliedAt: string;
};

/**
 * Query the _migrations table to get all deployed migrations.
 * Returns empty array if table doesn't exist or is empty.
 */
export const getDeployedMigrations = async (
  db: Database
): Promise<DeployedMigration[]> => {
  // Check if _migrations table exists
  const tableCheck = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'`,
  });

  if (tableCheck.rows.length === 0) {
    return [];
  }

  // Query all migrations
  const result = await db.execute({
    sql: `SELECT version, name, applied_at FROM _migrations ORDER BY version`,
  });

  return result.rows.map((row) => ({
    version: row.version as number,
    name: row.name as string,
    appliedAt: row.applied_at as string,
  }));
};

/**
 * Get the highest version number of deployed migrations.
 * Returns 0 if no migrations have been deployed.
 */
export const getLastDeployedVersion = async (db: Database): Promise<number> => {
  const migrations = await getDeployedMigrations(db);

  if (migrations.length === 0) {
    return 0;
  }

  return Math.max(...migrations.map((m) => m.version));
};
