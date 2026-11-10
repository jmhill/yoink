/**
 * Database abstraction for LibSQL (Turso and local SQLite).
 *
 * This provides a minimal async interface that works with:
 * - Turso cloud database
 * - Local file-based SQLite via LibSQL
 * - In-memory SQLite for tests
 */

export type QueryResult = {
  rows: Record<string, unknown>[];
  rowsAffected: number;
  lastInsertRowid?: number | bigint;
};

export type Database = {
  /**
   * Execute a single SQL statement.
   * `access: 'read'` may be retried once after a Turso connection failure.
   * Omit `access`, or pass `'write'`, for anything that might commit: those calls time out but are never retried.
   */
  execute: (query: {
    sql: string;
    args?: unknown[];
    access?: 'read' | 'write';
  }) => Promise<QueryResult>;

  /**
   * Execute multiple SQL statements in a batch (one transaction).
   * Mode `'read'` may be retried once. `'write'` (the default) is never retried.
   */
  batch: (
    queries: { sql: string; args?: unknown[] }[],
    mode?: 'write' | 'read'
  ) => Promise<QueryResult[]>;

  /**
   * One Turso request: foreign keys off, then these statements, then foreign keys on.
   * `batch` cannot do that. Its transaction starts before any statement, and
   * `PRAGMA foreign_keys` is a no-op inside a transaction. A separate
   * `execute('PRAGMA foreign_keys = OFF')` is a different HTTP request and
   * does not apply to the next one.
   */
  migrate?: (queries: { sql: string; args?: unknown[] }[]) => Promise<QueryResult[]>;

  /**
   * Close the database connection.
   */
  close: () => Promise<void>;
};

/**
 * Last migration that stays exempt from ownership. The next file in
 * `migrations/index.ts` is this version plus one. M1.3 does not add that file.
 */
export const LEGACY_MIGRATION_VERSION = 43 as const;

export const MIGRATION_OWNERS = [
  'access',
  'captures',
  'task-management',
  'notes',
  'review',
  'history',
  'platform',
] as const;

export type MigrationOwner = (typeof MIGRATION_OWNERS)[number];

type CountTo<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : CountTo<N, [...Acc, Acc['length']]>;

/**
 * 1 through {@link LEGACY_MIGRATION_VERSION}. `44` is that cutoff plus one.
 * The pair below fails typecheck if the constant changes and this span is not updated.
 */
type LegacyMigrationVersion = Exclude<CountTo<44>, 0>;
type LegacyCutoffIs43 = (typeof LEGACY_MIGRATION_VERSION) extends 43 ? true : never;
const legacyCutoffIs43: LegacyCutoffIs43 = true;
export const legacyMigrationCutoffIs43 = legacyCutoffIs43;

type MigrationCore = {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
};

/** Migrations `001`–`043`. They do not declare an owner. */
export type LegacyMigration = MigrationCore & {
  version: LegacyMigrationVersion;
  owner?: undefined;
  reason?: undefined;
};

/** A new migration that may touch only this module's tables. */
export type ModuleOwnedMigration = MigrationCore & {
  owner: Exclude<MigrationOwner, 'platform'>;
  reason?: undefined;
};

/**
 * A new migration that may touch any table. `reason` is the written
 * exception. A blank reason is rejected by the ownership test.
 */
export type PlatformMigration = MigrationCore & {
  owner: 'platform';
  reason: string;
};

export type Migration = LegacyMigration | ModuleOwnedMigration | PlatformMigration;
