import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { rebuildTable } from './table-rebuild.js';

describe('rebuildTable', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('rebuilds table with new schema preserving data', () => {
    // Create original table and insert data
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT
      )
    `);
    db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)').run(
      '1',
      'Alice',
      'alice@example.com'
    );
    db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)').run(
      '2',
      'Bob',
      'bob@example.com'
    );

    // Rebuild with added column
    rebuildTable(db, {
      tableName: 'users',
      newSchema: `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          name TEXT,
          email TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT '2024-01-01T00:00:00Z'
        )
      `,
      columnMapping: "SELECT id, name, email, '2024-01-01T00:00:00Z' as created_at",
    });

    // Verify data was preserved
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all() as {
      id: string;
      name: string;
      email: string;
      created_at: string;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: '1',
      name: 'Alice',
      email: 'alice@example.com',
      created_at: '2024-01-01T00:00:00Z',
    });
    expect(rows[1]).toEqual({
      id: '2',
      name: 'Bob',
      email: 'bob@example.com',
      created_at: '2024-01-01T00:00:00Z',
    });
  });

  it('recreates indexes after rebuild', () => {
    // Create original table with index
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        org_id TEXT,
        name TEXT
      )
    `);
    db.exec('CREATE INDEX idx_users_org ON users(org_id)');
    db.prepare('INSERT INTO users (id, org_id, name) VALUES (?, ?, ?)').run(
      '1',
      'org-1',
      'Alice'
    );

    // Rebuild with indexes
    rebuildTable(db, {
      tableName: 'users',
      newSchema: `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          name TEXT
        )
      `,
      columnMapping: 'SELECT id, org_id, name',
      indexes: ['CREATE INDEX idx_users_org ON users(org_id)'],
    });

    // Verify index exists
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as { name: string }[];
    expect(indexes.map((i) => i.name)).toContain('idx_users_org');
  });

  it('drops columns by excluding from column mapping', () => {
    // Create original table with column to drop
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT,
        legacy_field TEXT
      )
    `);
    db.prepare('INSERT INTO users (id, name, legacy_field) VALUES (?, ?, ?)').run(
      '1',
      'Alice',
      'old-value'
    );

    // Rebuild without the legacy field
    rebuildTable(db, {
      tableName: 'users',
      newSchema: `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          name TEXT
        )
      `,
      columnMapping: 'SELECT id, name',
    });

    // Verify column was dropped
    const info = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    const columnNames = info.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('name');
    expect(columnNames).not.toContain('legacy_field');

    // Verify data preserved
    const rows = db.prepare('SELECT * FROM users').all() as { id: string; name: string }[];
    expect(rows[0]).toEqual({ id: '1', name: 'Alice' });
  });

  it('transforms data during rebuild', () => {
    // Create original table
    db.exec(`
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        price_cents INTEGER
      )
    `);
    db.prepare('INSERT INTO items (id, price_cents) VALUES (?, ?)').run('1', 1000);
    db.prepare('INSERT INTO items (id, price_cents) VALUES (?, ?)').run('2', 2500);

    // Rebuild with transformed column
    rebuildTable(db, {
      tableName: 'items',
      newSchema: `
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          price_dollars REAL
        )
      `,
      columnMapping: 'SELECT id, CAST(price_cents AS REAL) / 100 as price_dollars',
    });

    // Verify transformation
    const rows = db.prepare('SELECT * FROM items ORDER BY id').all() as {
      id: string;
      price_dollars: number;
    }[];
    expect(rows[0].price_dollars).toBe(10.0);
    expect(rows[1].price_dollars).toBe(25.0);
  });

  it('rolls back on error during rebuild', () => {
    // Create original table
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT
      )
    `);
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run('1', 'Alice');

    // Attempt rebuild with invalid SQL
    expect(() =>
      rebuildTable(db, {
        tableName: 'users',
        newSchema: `
          CREATE TABLE users (
            id TEXT PRIMARY KEY,
            name TEXT
          )
        `,
        columnMapping: 'SELECT id, nonexistent_column', // This will fail
      })
    ).toThrow();

    // Original table should still exist with data intact
    const rows = db.prepare('SELECT * FROM users').all() as { id: string; name: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: '1', name: 'Alice' });
  });

  it('handles foreign keys by disabling during rebuild', () => {
    // Enable foreign keys
    db.exec('PRAGMA foreign_keys = ON');

    // Create tables with foreign key relationship
    db.exec(`
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        name TEXT
      )
    `);
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        org_id TEXT REFERENCES organizations(id),
        name TEXT
      )
    `);
    db.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)').run('org-1', 'Acme');
    db.prepare('INSERT INTO users (id, org_id, name) VALUES (?, ?, ?)').run(
      '1',
      'org-1',
      'Alice'
    );

    // Rebuild users table (should work despite FK)
    rebuildTable(db, {
      tableName: 'users',
      newSchema: `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL REFERENCES organizations(id),
          name TEXT
        )
      `,
      columnMapping: 'SELECT id, org_id, name',
    });

    // Verify FK enforcement is restored
    const fkStatus = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(fkStatus.foreign_keys).toBe(1);

    // Verify data integrity
    const rows = db.prepare('SELECT * FROM users').all() as {
      id: string;
      org_id: string;
      name: string;
    }[];
    expect(rows[0]).toEqual({ id: '1', org_id: 'org-1', name: 'Alice' });
  });
});
