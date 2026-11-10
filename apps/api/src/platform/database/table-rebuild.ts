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
 * Uses `db.migrate()` so the rebuild is one request on Turso HTTP.
 * `client.migrate` turns foreign keys off before `BEGIN` and back on after
 * `COMMIT`. `db.batch()` cannot: it starts the transaction first, and
 * `PRAGMA foreign_keys` does nothing inside a transaction. A separate
 * `execute('PRAGMA foreign_keys = OFF')` is another HTTP request, so the
 * rebuild request still runs with Turso's default, foreign keys on.
 *
 * The process, inside that one request:
 * 1. Turn foreign keys off
 * 2. Create new table with desired schema (as tableName_new)
 * 3. Copy data from old table to new table
 * 4. Drop old table
 * 5. Rename new table to original name
 * 6. Recreate indexes
 * 7. Fail the transaction if `PRAGMA foreign_key_check` reports a row
 * 8. Turn foreign keys back on
 *
 * Steps 2-7 are one transaction. If any step fails, it rolls back and the
 * original table remains unchanged.
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
  const migrate = db.migrate;
  if (migrate === undefined) {
    throw new Error('rebuildTable requires Database.migrate');
  }

  const { tableName, newSchema, columnMapping, indexes = [] } = options;
  const tempTableName = `${tableName}_new`;
  const schemaWithTempName = newSchema.replace(
    new RegExp(`CREATE\\s+TABLE\\s+${tableName}\\b`, 'i'),
    `CREATE TABLE ${tempTableName}`
  );

  // The guard table is created and dropped in this transaction. A row from
  // pragma_foreign_key_check violates CHECK (x = 0) and rolls the rebuild back.
  // The name stays out of a schema literal so the table inventory does not
  // treat this helper as a migration.
  const foreignKeyGuard = '_yoink_fk_guard';
  await migrate([
    { sql: schemaWithTempName },
    { sql: `INSERT INTO ${tempTableName} ${columnMapping} FROM ${tableName}` },
    { sql: `DROP TABLE ${tableName}` },
    { sql: `ALTER TABLE ${tempTableName} RENAME TO ${tableName}` },
    ...indexes.map((indexSql) => ({ sql: indexSql })),
    {
      sql: `CREATE TABLE ${foreignKeyGuard} (x INTEGER PRIMARY KEY CHECK (x = 0))`,
    },
    {
      sql: `INSERT INTO ${foreignKeyGuard} (x) SELECT 1 FROM pragma_foreign_key_check LIMIT 1`,
    },
    { sql: `DROP TABLE ${foreignKeyGuard}` },
  ]);
};
