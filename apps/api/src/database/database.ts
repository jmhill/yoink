import { createClient, type Client, type InValue } from '@libsql/client';
import type { DatabaseConfig } from '../config/schema.js';
import type { Database, QueryResult } from './types.js';

/**
 * Create a database connection based on the provided configuration.
 *
 * Supports three modes:
 * - `turso`: Connect to Turso cloud database (requires URL and auth token)
 * - `file`: Local file-based SQLite via LibSQL
 * - `memory`: In-memory SQLite for tests
 */
export const createDatabase = (config: DatabaseConfig): Database => {
  let client: Client;

  switch (config.type) {
    case 'turso':
      client = createClient({
        url: config.url,
        authToken: config.authToken,
      });
      break;
    case 'memory':
      client = createClient({ url: ':memory:' });
      break;
    case 'file':
      client = createClient({ url: `file:${config.path}` });
      break;
  }

  return {
    execute: async (query): Promise<QueryResult> => {
      const result = await client.execute({
        sql: query.sql,
        args: (query.args ?? []) as InValue[],
      });
      return {
        rows: result.rows as Record<string, unknown>[],
        rowsAffected: result.rowsAffected,
        lastInsertRowid: result.lastInsertRowid ?? undefined,
      };
    },

    batch: async (queries, mode = 'write') => {
      await client.batch(
        queries.map((q) => ({
          sql: q.sql,
          args: (q.args ?? []) as InValue[],
        })),
        mode
      );
    },

    close: async () => {
      client.close();
    },
  };
};

export type { Database } from './types.js';
