import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrator.js';
import type { Migration } from './types.js';

describe('runMigrations', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  const createTestMigrations = (): Migration[] => [
    {
      version: 1,
      name: 'create_foo',
      up: (db) => db.exec('CREATE TABLE foo (id TEXT PRIMARY KEY)'),
    },
    {
      version: 2,
      name: 'create_bar',
      up: (db) => db.exec('CREATE TABLE bar (id TEXT PRIMARY KEY)'),
    },
    {
      version: 3,
      name: 'create_baz',
      up: (db) => db.exec('CREATE TABLE baz (id TEXT PRIMARY KEY)'),
    },
  ];

  it('creates _migrations table on first run', () => {
    const migrations = createTestMigrations();

    runMigrations(db, migrations);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it('applies all migrations on empty database', () => {
    const migrations = createTestMigrations();

    const result = runMigrations(db, migrations);

    expect(result.applied).toEqual(['create_foo', 'create_bar', 'create_baz']);
    expect(result.alreadyApplied).toEqual([]);

    // Verify tables were created
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('foo');
    expect(tableNames).toContain('bar');
    expect(tableNames).toContain('baz');
  });

  it('applies only new migrations on partially migrated database', () => {
    const migrations = createTestMigrations();

    // First run - apply first two migrations
    runMigrations(db, migrations.slice(0, 2));

    // Second run - full list
    const result = runMigrations(db, migrations);

    expect(result.applied).toEqual(['create_baz']);
    expect(result.alreadyApplied).toEqual(['create_foo', 'create_bar']);
  });

  it('applies no migrations on fully migrated database', () => {
    const migrations = createTestMigrations();

    // First run
    runMigrations(db, migrations);

    // Second run
    const result = runMigrations(db, migrations);

    expect(result.applied).toEqual([]);
    expect(result.alreadyApplied).toEqual(['create_foo', 'create_bar', 'create_baz']);
  });

  it('records migration metadata in _migrations table', () => {
    const migrations = createTestMigrations();

    runMigrations(db, migrations);

    const records = db
      .prepare('SELECT version, name, applied_at FROM _migrations ORDER BY version')
      .all() as { version: number; name: string; applied_at: string }[];

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ version: 1, name: 'create_foo' });
    expect(records[1]).toMatchObject({ version: 2, name: 'create_bar' });
    expect(records[2]).toMatchObject({ version: 3, name: 'create_baz' });

    // applied_at should be ISO timestamp
    records.forEach((r) => {
      expect(new Date(r.applied_at).toISOString()).toBe(r.applied_at);
    });
  });

  it('throws error when migration version has different name than previously applied', () => {
    const migrations = createTestMigrations();

    // First run
    runMigrations(db, migrations.slice(0, 1));

    // Second run with renamed migration
    const renamedMigrations: Migration[] = [
      {
        version: 1,
        name: 'create_foo_RENAMED', // Different name!
        up: (db) => db.exec('CREATE TABLE foo (id TEXT PRIMARY KEY)'),
      },
    ];

    expect(() => runMigrations(db, renamedMigrations)).toThrow(
      'Migration version 1 was previously applied as "create_foo" but is now named "create_foo_RENAMED"'
    );
  });

  it('applies migrations in version order regardless of array order', () => {
    // Migrations in reverse order
    const migrations: Migration[] = [
      {
        version: 3,
        name: 'third',
        up: (db) => db.exec('CREATE TABLE third (id TEXT PRIMARY KEY)'),
      },
      {
        version: 1,
        name: 'first',
        up: (db) => db.exec('CREATE TABLE first (id TEXT PRIMARY KEY)'),
      },
      {
        version: 2,
        name: 'second',
        up: (db) => db.exec('CREATE TABLE second (id TEXT PRIMARY KEY)'),
      },
    ];

    const result = runMigrations(db, migrations);

    // Should be applied in version order
    expect(result.applied).toEqual(['first', 'second', 'third']);
  });

  it('handles empty migrations array', () => {
    const result = runMigrations(db, []);

    expect(result.applied).toEqual([]);
    expect(result.alreadyApplied).toEqual([]);

    // _migrations table should still be created
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it('rolls back failed migration leaving database unchanged', () => {
    const migrations: Migration[] = [
      {
        version: 1,
        name: 'create_foo',
        up: (db) => db.exec('CREATE TABLE foo (id TEXT PRIMARY KEY)'),
      },
      {
        version: 2,
        name: 'failing_migration',
        up: (db) => {
          // Create a table, then fail mid-migration
          db.exec('CREATE TABLE partial (id TEXT PRIMARY KEY)');
          throw new Error('Migration failed intentionally');
        },
      },
    ];

    // First migration should succeed
    runMigrations(db, migrations.slice(0, 1));

    // Second migration should fail and rollback
    expect(() => runMigrations(db, migrations)).toThrow(
      'Migration failed intentionally'
    );

    // The partial table should NOT exist (rolled back)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('foo'); // First migration persisted
    expect(tableNames).not.toContain('partial'); // Failed migration rolled back

    // Migration 2 should NOT be recorded
    const records = db
      .prepare('SELECT version, name FROM _migrations ORDER BY version')
      .all() as { version: number; name: string }[];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ version: 1, name: 'create_foo' });
  });
});
