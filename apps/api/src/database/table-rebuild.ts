import type { DatabaseSync } from 'node:sqlite';

export type RebuildTableOptions = {
  /** The name of the table to rebuild */
  tableName: string;
  /** The CREATE TABLE statement for the new schema */
  newSchema: string;
  /** SELECT statement for data migration (columns to copy from old table) */
  columnMapping: string;
  /** Optional array of CREATE INDEX statements to recreate after rebuild */
  indexes?: string[];
};

/**
 * Rebuild a table with a new schema, preserving data.
 *
 * This implements SQLite's "12-step table rebuild" pattern for schema changes
 * that ALTER TABLE cannot handle (dropping columns, changing types, adding
 * NOT NULL constraints, etc.).
 *
 * The process:
 * 1. Disable foreign key enforcement
 * 2. Start a transaction
 * 3. Create new table with desired schema (as tableName_new)
 * 4. Copy data from old table to new table
 * 5. Drop old table
 * 6. Rename new table to original name
 * 7. Recreate indexes
 * 8. Commit and re-enable foreign keys
 *
 * If any step fails, the transaction is rolled back and the original table
 * remains unchanged.
 *
 * @example
 * // Add NOT NULL constraint and new column
 * rebuildTable(db, {
 *   tableName: 'users',
 *   newSchema: `
 *     CREATE TABLE users (
 *       id TEXT PRIMARY KEY,
 *       email TEXT NOT NULL,
 *       created_at TEXT NOT NULL DEFAULT '2024-01-01T00:00:00Z'
 *     )
 *   `,
 *   columnMapping: 'SELECT id, email, "2024-01-01T00:00:00Z" as created_at',
 *   indexes: ['CREATE INDEX idx_users_email ON users(email)'],
 * });
 *
 * @example
 * // Drop a column
 * rebuildTable(db, {
 *   tableName: 'users',
 *   newSchema: `
 *     CREATE TABLE users (
 *       id TEXT PRIMARY KEY,
 *       name TEXT
 *     )
 *   `,
 *   columnMapping: 'SELECT id, name', // Excludes legacy_field
 * });
 */
export const rebuildTable = (db: DatabaseSync, options: RebuildTableOptions): void => {
  const { tableName, newSchema, columnMapping, indexes = [] } = options;

  // Check if foreign keys are currently enabled so we can restore the setting
  const fkStatus = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
  const fkWasEnabled = fkStatus.foreign_keys === 1;

  // Disable foreign keys during rebuild
  db.exec('PRAGMA foreign_keys = OFF');

  // Use SAVEPOINT for nested transaction support - works whether or not we're already in a transaction
  const savepointName = `rebuild_${tableName}_${Date.now()}`;
  db.exec(`SAVEPOINT ${savepointName}`);
  try {
    // Create new table with temporary name
    const tempTableName = `${tableName}_new`;
    const schemaWithTempName = newSchema.replace(
      new RegExp(`CREATE\\s+TABLE\\s+${tableName}\\b`, 'i'),
      `CREATE TABLE ${tempTableName}`
    );
    db.exec(schemaWithTempName);

    // Copy data from old table to new table
    db.exec(`INSERT INTO ${tempTableName} ${columnMapping} FROM ${tableName}`);

    // Drop old table
    db.exec(`DROP TABLE ${tableName}`);

    // Rename new table to original name
    db.exec(`ALTER TABLE ${tempTableName} RENAME TO ${tableName}`);

    // Recreate indexes
    for (const indexSql of indexes) {
      db.exec(indexSql);
    }

    db.exec(`RELEASE SAVEPOINT ${savepointName}`);
  } catch (error) {
    db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    db.exec(`RELEASE SAVEPOINT ${savepointName}`);
    throw error;
  } finally {
    // Restore foreign key setting
    if (fkWasEnabled) {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
};
