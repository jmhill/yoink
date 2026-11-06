import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rebuildTable } from './table-rebuild.js';
import { createBareTestDatabase, type Database } from './test-utils.js';

describe('rebuildTable', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('rebuilds table with new schema preserving data', async () => {
    // Create original table and insert data
    await db.execute({
      sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT
      )
    `,
    });
    await db.execute({
      sql: 'INSERT INTO users (id, name, email) VALUES (?, ?, ?)',
      args: ['1', 'Alice', 'alice@example.com'],
    });
    await db.execute({
      sql: 'INSERT INTO users (id, name, email) VALUES (?, ?, ?)',
      args: ['2', 'Bob', 'bob@example.com'],
    });

    // Rebuild with added column
    await rebuildTable(db, {
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
    const result = await db.execute({ sql: 'SELECT * FROM users ORDER BY id' });
    const rows = result.rows as {
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

  it('recreates indexes after rebuild', async () => {
    // Create original table with index
    await db.execute({
      sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        org_id TEXT,
        name TEXT
      )
    `,
    });
    await db.execute({ sql: 'CREATE INDEX idx_users_org ON users(org_id)' });
    await db.execute({
      sql: 'INSERT INTO users (id, org_id, name) VALUES (?, ?, ?)',
      args: ['1', 'org-1', 'Alice'],
    });

    // Rebuild with indexes
    await rebuildTable(db, {
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
    const result = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users' AND name NOT LIKE 'sqlite_%'",
    });
    const indexes = result.rows as { name: string }[];
    expect(indexes.map((i) => i.name)).toContain('idx_users_org');
  });

  it('drops columns by excluding from column mapping', async () => {
    // Create original table with column to drop
    await db.execute({
      sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT,
        legacy_field TEXT
      )
    `,
    });
    await db.execute({
      sql: 'INSERT INTO users (id, name, legacy_field) VALUES (?, ?, ?)',
      args: ['1', 'Alice', 'old-value'],
    });

    // Rebuild without the legacy field
    await rebuildTable(db, {
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
    const infoResult = await db.execute({ sql: 'PRAGMA table_info(users)' });
    const info = infoResult.rows as { name: string }[];
    const columnNames = info.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('name');
    expect(columnNames).not.toContain('legacy_field');

    // Verify data preserved
    const dataResult = await db.execute({ sql: 'SELECT * FROM users' });
    const rows = dataResult.rows as { id: string; name: string }[];
    expect(rows[0]).toEqual({ id: '1', name: 'Alice' });
  });

  it('transforms data during rebuild', async () => {
    // Create original table
    await db.execute({
      sql: `
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        price_cents INTEGER
      )
    `,
    });
    await db.execute({
      sql: 'INSERT INTO items (id, price_cents) VALUES (?, ?)',
      args: ['1', 1000],
    });
    await db.execute({
      sql: 'INSERT INTO items (id, price_cents) VALUES (?, ?)',
      args: ['2', 2500],
    });

    // Rebuild with transformed column
    await rebuildTable(db, {
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
    const result = await db.execute({ sql: 'SELECT * FROM items ORDER BY id' });
    const rows = result.rows as { id: string; price_dollars: number }[];
    expect(rows[0].price_dollars).toBe(10.0);
    expect(rows[1].price_dollars).toBe(25.0);
  });

  it('rolls back on error during rebuild', async () => {
    // Create original table
    await db.execute({
      sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT
      )
    `,
    });
    await db.execute({
      sql: 'INSERT INTO users (id, name) VALUES (?, ?)',
      args: ['1', 'Alice'],
    });

    // Attempt rebuild with invalid SQL
    await expect(
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
    ).rejects.toThrow();

    // Original table should still exist with data intact
    const result = await db.execute({ sql: 'SELECT * FROM users' });
    const rows = result.rows as { id: string; name: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: '1', name: 'Alice' });
  });

  it('handles foreign keys by disabling during rebuild', async () => {
    // Enable foreign keys
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });

    // Create tables with foreign key relationship
    await db.execute({
      sql: `
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        name TEXT
      )
    `,
    });
    await db.execute({
      sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        org_id TEXT REFERENCES organizations(id),
        name TEXT
      )
    `,
    });
    await db.execute({
      sql: 'INSERT INTO organizations (id, name) VALUES (?, ?)',
      args: ['org-1', 'Acme'],
    });
    await db.execute({
      sql: 'INSERT INTO users (id, org_id, name) VALUES (?, ?, ?)',
      args: ['1', 'org-1', 'Alice'],
    });

    // Rebuild users table (should work despite FK)
    await rebuildTable(db, {
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
    const fkResult = await db.execute({ sql: 'PRAGMA foreign_keys' });
    const fkStatus = fkResult.rows[0] as { foreign_keys: number };
    expect(fkStatus.foreign_keys).toBe(1);

    // Verify data integrity
    const dataResult = await db.execute({ sql: 'SELECT * FROM users' });
    const rows = dataResult.rows as { id: string; org_id: string; name: string }[];
    expect(rows[0]).toEqual({ id: '1', org_id: 'org-1', name: 'Alice' });
  });
});
