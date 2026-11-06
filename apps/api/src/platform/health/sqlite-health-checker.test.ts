import { describe, it, expect } from 'vitest';
import { createDatabase } from '../database/database.js';
import type { Database } from '../database/types.js';
import { createSqliteHealthChecker } from './sqlite-health-checker.js';

const failingDatabase = (): Database => ({
  execute: () => Promise.reject(new Error('sqlite closed')),
  batch: () => Promise.reject(new Error('sqlite closed')),
  close: () => Promise.resolve(),
});

describe('SqliteHealthChecker', () => {
  it('reports connected after SELECT 1', async () => {
    const queries: string[] = [];
    const database = createDatabase({ type: 'memory' });
    const original = database.execute.bind(database);
    database.execute = async (query) => {
      queries.push(query.sql);
      return original(query);
    };

    try {
      const result = await createSqliteHealthChecker(database).check();

      expect(queries).toEqual(['SELECT 1']);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          status: 'healthy',
          database: 'connected',
        });
      }
    } finally {
      await database.close();
    }
  });

  it('returns error when the connectivity query fails', async () => {
    const result = await createSqliteHealthChecker(failingDatabase()).check();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('HEALTH_CHECK_ERROR');
      expect(result.error.message).toBe('Database health check failed');
    }
  });
});
