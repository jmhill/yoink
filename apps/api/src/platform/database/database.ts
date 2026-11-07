import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
const createClientFor = (config: DatabaseConfig): Client => {
  switch (config.type) {
    case 'turso':
      return createClient({
        url: config.url,
        authToken: config.authToken,
      });
    case 'memory':
      return createClient({ url: ':memory:' });
    case 'file':
      mkdirSync(dirname(config.path), { recursive: true });
      return createClient({ url: `file:${config.path}` });
  }
};

const databaseFrom = (client: Client): Database => ({
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

  batch: async (queries, mode = 'write'): Promise<QueryResult[]> => {
    const results = await client.batch(
      queries.map((q) => ({
        sql: q.sql,
        args: (q.args ?? []) as InValue[],
      })),
      mode
    );
    return results.map((result) => ({
      rows: result.rows as Record<string, unknown>[],
      rowsAffected: result.rowsAffected,
      lastInsertRowid: result.lastInsertRowid ?? undefined,
    }));
  },

  close: async () => {
    client.close();
  },
});

/** One client for queries and for the unit of work. A second `:memory:` client is a different database. */
export const openDatabase = (config: DatabaseConfig): { readonly database: Database; readonly client: Client } => {
  const client = createClientFor(config);
  return { database: databaseFrom(client), client };
};

export const createDatabase = (config: DatabaseConfig): Database => openDatabase(config).database;

export type { Database } from './types.js';
