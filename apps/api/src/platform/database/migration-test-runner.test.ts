import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDatabase } from './database.js';
import { runMigrations } from './migrator.js';
import type { Database, Migration } from './types.js';
import { testPendingMigrations } from './migration-test-runner.js';

describe('Migration test runner', () => {
  const testDbPath = './tmp/migration-runner-test.db';
  let productionDb: Database;

  // Simple migrations for testing
  const migration1: Migration = {
    version: 1,
    name: 'create_orgs',
    up: async (db) => {
      await db.execute({
        sql: 'CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT, created_at TEXT)',
      });
    },
  };

  const migration2: Migration = {
    version: 2,
    name: 'create_users',
    up: async (db) => {
      await db.execute({
        sql: 'CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, created_at TEXT)',
      });
    },
  };

  const migration3: Migration = {
    version: 3,
    name: 'add_user_org_fk',
    up: async (db) => {
      await db.execute({
        sql: 'ALTER TABLE users ADD COLUMN organization_id TEXT REFERENCES organizations(id)',
      });
    },
  };

  const failingMigration: Migration = {
    version: 4,
    name: 'failing_migration',
    up: async () => {
      throw new Error('Intentional failure for testing');
    },
  };

  beforeEach(() => {
    // Create tmp directory if needed
    mkdirSync(dirname(testDbPath), { recursive: true });

    // Clean up any existing test db
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }

    // Create a "production" database to simulate querying deployed migrations
    productionDb = createDatabase({ type: 'memory' });
  });

  afterEach(async () => {
    await productionDb.close();
    // Clean up test db
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  describe('testPendingMigrations', () => {
    it('returns success with no pending migrations when all are deployed', async () => {
      // "Production" has all 3 migrations
      await runMigrations(productionDb, [migration1, migration2, migration3]);

      const result = await testPendingMigrations({
        productionDb,
        localDbPath: testDbPath,
        allMigrations: [migration1, migration2, migration3],
      });

      expect(result.success).toBe(true);
      expect(result.deployedVersion).toBe(3);
      expect(result.testedMigrations).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('tests pending migrations against seeded data', async () => {
      // "Production" has migrations 1 and 2
      await runMigrations(productionDb, [migration1, migration2]);

      const result = await testPendingMigrations({
        productionDb,
        localDbPath: testDbPath,
        allMigrations: [migration1, migration2, migration3],
      });

      expect(result.success).toBe(true);
      expect(result.deployedVersion).toBe(2);
      expect(result.testedMigrations).toEqual(['add_user_org_fk']);
    });

    it('reports failure with error message when migration fails', async () => {
      // "Production" has migrations 1-3
      await runMigrations(productionDb, [migration1, migration2, migration3]);

      const result = await testPendingMigrations({
        productionDb,
        localDbPath: testDbPath,
        allMigrations: [migration1, migration2, migration3, failingMigration],
      });

      expect(result.success).toBe(false);
      expect(result.deployedVersion).toBe(3);
      expect(result.error).toContain('failing_migration');
      expect(result.error).toContain('Intentional failure');
    });

    it('handles empty production database (no migrations deployed)', async () => {
      // Production has no migrations - fresh database
      const result = await testPendingMigrations({
        productionDb,
        localDbPath: testDbPath,
        allMigrations: [migration1, migration2],
      });

      expect(result.success).toBe(true);
      expect(result.deployedVersion).toBe(0);
      expect(result.testedMigrations).toEqual(['create_orgs', 'create_users']);
    });

    it('creates local database file', async () => {
      await runMigrations(productionDb, [migration1]);

      await testPendingMigrations({
        productionDb,
        localDbPath: testDbPath,
        allMigrations: [migration1, migration2],
      });

      expect(existsSync(testDbPath)).toBe(true);
    });
  });
});
