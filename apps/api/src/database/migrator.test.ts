import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from './test-utils.js';
import { runMigrations } from './migrator.js';
import type { Database, Migration } from './types.js';

describe('runMigrations', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  const createTestMigrations = (): Migration[] => [
    {
      version: 1,
      name: 'create_foo',
      up: async (db) => {
        await db.execute({ sql: 'CREATE TABLE foo (id TEXT PRIMARY KEY)' });
      },
    },
    {
      version: 2,
      name: 'create_bar',
      up: async (db) => {
        await db.execute({ sql: 'CREATE TABLE bar (id TEXT PRIMARY KEY)' });
      },
    },
    {
      version: 3,
      name: 'create_baz',
      up: async (db) => {
        await db.execute({ sql: 'CREATE TABLE baz (id TEXT PRIMARY KEY)' });
      },
    },
  ];

  it('creates _migrations table on first run', async () => {
    const migrations = createTestMigrations();

    await runMigrations(db, migrations);

    const result = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'",
    });
    expect(result.rows).toHaveLength(1);
  });

  it('applies all migrations on empty database', async () => {
    const migrations = createTestMigrations();

    const result = await runMigrations(db, migrations);

    expect(result.applied).toEqual(['create_foo', 'create_bar', 'create_baz']);
    expect(result.alreadyApplied).toEqual([]);

    // Verify tables were created
    const tablesResult = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    });
    const tableNames = (tablesResult.rows as { name: string }[]).map((t) => t.name);
    expect(tableNames).toContain('foo');
    expect(tableNames).toContain('bar');
    expect(tableNames).toContain('baz');
  });

  it('applies only new migrations on partially migrated database', async () => {
    const migrations = createTestMigrations();

    // First run - apply first two migrations
    await runMigrations(db, migrations.slice(0, 2));

    // Second run - full list
    const result = await runMigrations(db, migrations);

    expect(result.applied).toEqual(['create_baz']);
    expect(result.alreadyApplied).toEqual(['create_foo', 'create_bar']);
  });

  it('applies no migrations on fully migrated database', async () => {
    const migrations = createTestMigrations();

    // First run
    await runMigrations(db, migrations);

    // Second run
    const result = await runMigrations(db, migrations);

    expect(result.applied).toEqual([]);
    expect(result.alreadyApplied).toEqual(['create_foo', 'create_bar', 'create_baz']);
  });

  it('records migration metadata in _migrations table', async () => {
    const migrations = createTestMigrations();

    await runMigrations(db, migrations);

    const result = await db.execute({
      sql: 'SELECT version, name, applied_at FROM _migrations ORDER BY version',
    });
    const records = result.rows as { version: number; name: string; applied_at: string }[];

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ version: 1, name: 'create_foo' });
    expect(records[1]).toMatchObject({ version: 2, name: 'create_bar' });
    expect(records[2]).toMatchObject({ version: 3, name: 'create_baz' });

    // applied_at should be ISO timestamp
    records.forEach((r) => {
      expect(new Date(r.applied_at).toISOString()).toBe(r.applied_at);
    });
  });

  it('throws error when migration version has different name than previously applied', async () => {
    const migrations = createTestMigrations();

    // First run
    await runMigrations(db, migrations.slice(0, 1));

    // Second run with renamed migration
    const renamedMigrations: Migration[] = [
      {
        version: 1,
        name: 'create_foo_RENAMED', // Different name!
        up: async (db) => {
          await db.execute({ sql: 'CREATE TABLE foo (id TEXT PRIMARY KEY)' });
        },
      },
    ];

    await expect(runMigrations(db, renamedMigrations)).rejects.toThrow(
      'Migration version 1 was previously applied as "create_foo" but is now named "create_foo_RENAMED"'
    );
  });

  it('applies migrations in version order regardless of array order', async () => {
    // Migrations in reverse order
    const migrations: Migration[] = [
      {
        version: 3,
        name: 'third',
        up: async (db) => {
          await db.execute({ sql: 'CREATE TABLE third (id TEXT PRIMARY KEY)' });
        },
      },
      {
        version: 1,
        name: 'first',
        up: async (db) => {
          await db.execute({ sql: 'CREATE TABLE first (id TEXT PRIMARY KEY)' });
        },
      },
      {
        version: 2,
        name: 'second',
        up: async (db) => {
          await db.execute({ sql: 'CREATE TABLE second (id TEXT PRIMARY KEY)' });
        },
      },
    ];

    const result = await runMigrations(db, migrations);

    // Should be applied in version order
    expect(result.applied).toEqual(['first', 'second', 'third']);
  });

  it('handles empty migrations array', async () => {
    const result = await runMigrations(db, []);

    expect(result.applied).toEqual([]);
    expect(result.alreadyApplied).toEqual([]);

    // _migrations table should still be created
    const tablesResult = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'",
    });
    expect(tablesResult.rows).toHaveLength(1);
  });

  it('does not record failed migration but may leave partial state', async () => {
    // Note: With Turso HTTP, raw SQL transactions don't persist across requests,
    // so migrations cannot be rolled back atomically. Migrations that need atomic
    // behavior should use db.batch() internally.
    //
    // This test verifies that:
    // 1. The migration failure is propagated with context
    // 2. The failed migration is NOT recorded in _migrations
    // 3. Successfully applied migrations before the failure are preserved
    const migrations: Migration[] = [
      {
        version: 1,
        name: 'create_foo',
        up: async (db) => {
          await db.execute({ sql: 'CREATE TABLE foo (id TEXT PRIMARY KEY)' });
        },
      },
      {
        version: 2,
        name: 'failing_migration',
        up: async (db) => {
          // Create a table, then fail mid-migration
          // In a real scenario, use batch() for atomic behavior
          await db.execute({ sql: 'CREATE TABLE partial (id TEXT PRIMARY KEY)' });
          throw new Error('Migration failed intentionally');
        },
      },
    ];

    // First migration should succeed
    await runMigrations(db, migrations.slice(0, 1));

    // Second migration should fail with context
    await expect(runMigrations(db, migrations)).rejects.toThrow(
      'Migration 2 (failing_migration) failed: Migration failed intentionally'
    );

    // First migration should still be recorded
    const tablesResult = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    });
    const tableNames = (tablesResult.rows as { name: string }[]).map((t) => t.name);
    expect(tableNames).toContain('foo'); // First migration persisted

    // Note: The 'partial' table may exist because migrations don't auto-rollback
    // without using batch(). This is expected for Turso HTTP compatibility.

    // Failed migration should NOT be recorded in _migrations
    const recordsResult = await db.execute({
      sql: 'SELECT version, name FROM _migrations ORDER BY version',
    });
    const records = recordsResult.rows as { version: number; name: string }[];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ version: 1, name: 'create_foo' });
  });
});
