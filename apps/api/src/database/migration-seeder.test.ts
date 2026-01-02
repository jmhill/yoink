import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from './test-utils.js';
import type { Database } from './types.js';
import { seedMigrationTestData, type SeedResult } from './migration-seeder.js';

describe('Migration seeder', () => {
  let db: Database;
  let seedResult: SeedResult;

  beforeEach(async () => {
    // Create database with all migrations applied
    db = await createTestDatabase();
    // Seed the test data
    seedResult = await seedMigrationTestData(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('organizations', () => {
    it('creates organizations', async () => {
      const result = await db.execute({
        sql: 'SELECT id, name FROM organizations',
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(2);
      expect(seedResult.organizationIds.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('users', () => {
    it('creates users', async () => {
      const result = await db.execute({
        sql: 'SELECT id, email FROM users',
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(2);
      expect(seedResult.userIds.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('organization_memberships', () => {
    it('creates memberships linking users to organizations', async () => {
      const result = await db.execute({
        sql: 'SELECT id, user_id, organization_id, role FROM organization_memberships',
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(2);
      // Verify FKs are valid
      for (const row of result.rows) {
        expect(seedResult.userIds).toContain(row.user_id);
        expect(seedResult.organizationIds).toContain(row.organization_id);
      }
    });
  });

  describe('api_tokens', () => {
    it('creates API tokens with user FK', async () => {
      const result = await db.execute({
        sql: 'SELECT id, user_id, organization_id FROM api_tokens',
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      // Verify FKs are valid
      for (const row of result.rows) {
        expect(seedResult.userIds).toContain(row.user_id);
        expect(seedResult.organizationIds).toContain(row.organization_id);
      }
    });
  });

  describe('passkey_credentials', () => {
    it('creates passkey credentials with user FK', async () => {
      const result = await db.execute({
        sql: 'SELECT id, user_id FROM passkey_credentials',
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of result.rows) {
        expect(seedResult.userIds).toContain(row.user_id);
      }
    });
  });

  describe('user_sessions', () => {
    it('creates user sessions with user and organization FKs', async () => {
      const result = await db.execute({
        sql: 'SELECT id, user_id, current_organization_id FROM user_sessions',
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of result.rows) {
        expect(seedResult.userIds).toContain(row.user_id);
        expect(seedResult.organizationIds).toContain(row.current_organization_id);
      }
    });
  });

  describe('invitations', () => {
    it('creates invitations with organization and user FKs', async () => {
      const result = await db.execute({
        sql: 'SELECT id, organization_id, invited_by_user_id FROM invitations',
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of result.rows) {
        expect(seedResult.organizationIds).toContain(row.organization_id);
        // invited_by_user_id can be null (admin-created)
        if (row.invited_by_user_id) {
          expect(seedResult.userIds).toContain(row.invited_by_user_id);
        }
      }
    });
  });

  describe('captures', () => {
    it('creates captures with organization FK', async () => {
      const result = await db.execute({
        sql: 'SELECT id, organization_id, created_by_id FROM captures',
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of result.rows) {
        expect(seedResult.organizationIds).toContain(row.organization_id);
        // created_by_id references users but without FK constraint
        expect(seedResult.userIds).toContain(row.created_by_id);
      }
    });
  });

  describe('tasks', () => {
    it('creates tasks with organization, user, and capture FKs', async () => {
      const result = await db.execute({
        sql: 'SELECT id, organization_id, created_by_id, capture_id FROM tasks',
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of result.rows) {
        expect(seedResult.organizationIds).toContain(row.organization_id);
        expect(seedResult.userIds).toContain(row.created_by_id);
        // capture_id can be null
        if (row.capture_id) {
          expect(seedResult.captureIds).toContain(row.capture_id);
        }
      }
    });
  });

  describe('FK constraint validation', () => {
    it('all seeded data passes FK constraint validation', async () => {
      // Enable FK checks and run a pragma check
      const result = await db.execute({
        sql: 'PRAGMA foreign_key_check',
      });

      // Should return empty if all FKs are valid
      expect(result.rows).toEqual([]);
    });
  });
});
