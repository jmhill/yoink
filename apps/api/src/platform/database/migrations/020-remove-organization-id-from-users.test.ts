import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { seedMigrationTestData } from '../migration-seeder.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 20: remove_organization_id_from_users', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('succeeds when tables have data with foreign key relationships', async () => {
    // Run migrations 1-19 (simulating production state before migration 20)
    const migrationsBeforeTarget = migrations.filter((m) => m.version < 20);
    await runMigrations(db, migrationsBeforeTarget);

    // Seed data that exercises all FK relationships
    // This creates users with:
    // - organization_memberships referencing users.id
    // - api_tokens referencing users.id
    // - passkey_credentials referencing users.id
    // - user_sessions referencing users.id
    // - invitations referencing users.id
    // - tasks referencing users.id
    await seedMigrationTestData(db);

    // Verify we have data with FK relationships
    const usersBefore = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM users',
    });
    expect((usersBefore.rows[0].count as number)).toBeGreaterThan(0);

    const membershipsBefore = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM organization_memberships',
    });
    expect((membershipsBefore.rows[0].count as number)).toBeGreaterThan(0);

    // Run migration 20 - this should NOT fail with FK constraint error
    const migration20 = migrations.find((m) => m.version === 20);
    expect(migration20).toBeDefined();
    await runMigrations(db, [migration20!]);

    // Verify data is preserved
    const usersAfter = await db.execute({
      sql: 'SELECT id, email, created_at FROM users',
    });
    expect(usersAfter.rows.length).toBe((usersBefore.rows[0].count as number));

    // Verify organization_id column is removed
    const columns = await db.execute({
      sql: `PRAGMA table_info(users)`,
    });
    const columnNames = columns.rows.map((r) => r.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('email');
    expect(columnNames).toContain('created_at');
    expect(columnNames).not.toContain('organization_id');

    // Verify FK relationships still work
    const membershipsAfter = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM organization_memberships',
    });
    expect(membershipsAfter.rows[0].count).toBe(membershipsBefore.rows[0].count);

    // Verify FK constraints are valid
    const fkCheck = await db.execute({
      sql: 'PRAGMA foreign_key_check',
    });
    expect(fkCheck.rows).toEqual([]);
  });
});
