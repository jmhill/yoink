import type { Database } from './types.js';

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
 * Uses db.batch() for atomic execution, which works correctly with both
 * local SQLite and Turso HTTP connections (where raw SQL transactions
 * don't persist across requests).
 *
 * The process:
 * 1. Disable foreign key enforcement
 * 2. Create new table with desired schema (as tableName_new)
 * 3. Copy data from old table to new table
 * 4. Drop old table
 * 5. Rename new table to original name
 * 6. Recreate indexes
 * 7. Re-enable foreign keys
 *
 * All steps (2-6) run atomically in a single batch. If any step fails,
 * the entire batch is rolled back and the original table remains unchanged.
 *
 * @example
 * // Add NOT NULL constraint and new column
 * await rebuildTable(db, {
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
 * await rebuildTable(db, {
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
export const rebuildTable = async (db: Database, options: RebuildTableOptions): Promise<void> => {
  const { tableName, newSchema, columnMapping, indexes = [] } = options;

  // Disable foreign keys during rebuild (must be outside the batch)
  await db.execute({ sql: 'PRAGMA foreign_keys = OFF' });

  try {
    // Create new table with temporary name
    const tempTableName = `${tableName}_new`;
    const schemaWithTempName = newSchema.replace(
      new RegExp(`CREATE\\s+TABLE\\s+${tableName}\\b`, 'i'),
      `CREATE TABLE ${tempTableName}`
    );

    // Build batch of all rebuild operations
    const batchQueries: { sql: string }[] = [
      { sql: schemaWithTempName },
      { sql: `INSERT INTO ${tempTableName} ${columnMapping} FROM ${tableName}` },
      { sql: `DROP TABLE ${tableName}` },
      { sql: `ALTER TABLE ${tempTableName} RENAME TO ${tableName}` },
      ...indexes.map((indexSql) => ({ sql: indexSql })),
    ];

    // Execute all operations atomically
    // db.batch() runs as a transaction, so if any statement fails,
    // all changes are rolled back automatically
    await db.batch(batchQueries, 'write');
  } finally {
    // Re-enable foreign keys
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });
  }
};
