import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 35: add_organization_time_zone', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('adds time_zone defaulting to America/Chicago on existing orgs', async () => {
    await runMigrations(db, migrations);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2025-01-15T10:00:00.000Z'],
    });

    const result = await db.execute({
      sql: `SELECT time_zone FROM organizations WHERE id = ?`,
      args: ['org-1'],
    });

    expect(result.rows[0]?.time_zone).toBe('America/Chicago');
  });

  it('keeps an explicit IANA zone when set', async () => {
    await runMigrations(db, migrations);

    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at, time_zone) VALUES (?, ?, ?, ?)`,
      args: ['org-2', 'Auckland', '2025-01-15T10:00:00.000Z', 'Pacific/Auckland'],
    });

    const result = await db.execute({
      sql: `SELECT time_zone FROM organizations WHERE id = ?`,
      args: ['org-2'],
    });

    expect(result.rows[0]?.time_zone).toBe('Pacific/Auckland');
  });
});
