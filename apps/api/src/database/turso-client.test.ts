import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from './test-utils.js';
import { runMigrations } from './migrator.js';
import type { Database, Migration } from './types.js';
import {
  getDeployedMigrations,
  getLastDeployedVersion,
} from './turso-client.js';

describe('Turso client', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('getDeployedMigrations', () => {
    it('returns empty array when _migrations table does not exist', async () => {
      const result = await getDeployedMigrations(db);

      expect(result).toEqual([]);
    });

    it('returns empty array when _migrations table exists but is empty', async () => {
      await db.execute({
        sql: `CREATE TABLE _migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        )`,
      });

      const result = await getDeployedMigrations(db);

      expect(result).toEqual([]);
    });

    it('returns deployed migrations ordered by version', async () => {
      const testMigrations: Migration[] = [
        {
          version: 1,
          name: 'first_migration',
          up: async (db) => {
            await db.execute({ sql: 'CREATE TABLE test1 (id TEXT)' });
          },
        },
        {
          version: 2,
          name: 'second_migration',
          up: async (db) => {
            await db.execute({ sql: 'CREATE TABLE test2 (id TEXT)' });
          },
        },
      ];

      await runMigrations(db, testMigrations);

      const result = await getDeployedMigrations(db);

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(1);
      expect(result[0].name).toBe('first_migration');
      expect(result[1].version).toBe(2);
      expect(result[1].name).toBe('second_migration');
      // Each should have an appliedAt timestamp
      expect(result[0].appliedAt).toBeDefined();
      expect(result[1].appliedAt).toBeDefined();
    });
  });

  describe('getLastDeployedVersion', () => {
    it('returns 0 when _migrations table does not exist', async () => {
      const result = await getLastDeployedVersion(db);

      expect(result).toBe(0);
    });

    it('returns 0 when _migrations table is empty', async () => {
      await db.execute({
        sql: `CREATE TABLE _migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        )`,
      });

      const result = await getLastDeployedVersion(db);

      expect(result).toBe(0);
    });

    it('returns highest version number when migrations exist', async () => {
      const testMigrations: Migration[] = [
        {
          version: 1,
          name: 'first',
          up: async (db) => {
            await db.execute({ sql: 'CREATE TABLE t1 (id TEXT)' });
          },
        },
        {
          version: 5,
          name: 'fifth',
          up: async (db) => {
            await db.execute({ sql: 'CREATE TABLE t5 (id TEXT)' });
          },
        },
        {
          version: 3,
          name: 'third',
          up: async (db) => {
            await db.execute({ sql: 'CREATE TABLE t3 (id TEXT)' });
          },
        },
      ];

      await runMigrations(db, testMigrations);

      const result = await getLastDeployedVersion(db);

      expect(result).toBe(5);
    });
  });
});
