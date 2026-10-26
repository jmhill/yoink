import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { err, ok, type Result } from 'neverthrow';
import { createClient, type Config, type InValue } from '@libsql/client';
import type { DatabaseConfig } from '../config/schema.js';
import type { Database, QueryResult } from './types.js';
import { runTursoCall, TURSO_CALL_TIMEOUT_MS } from './run-turso-call.js';
import { fetchWithTimeout } from './turso-fetch.js';

export type DatabaseOptions = {
  readonly tursoCallTimeoutMs?: number;
};

const isInValue = (value: unknown): value is InValue =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'bigint' ||
  typeof value === 'boolean' ||
  value instanceof Uint8Array ||
  value instanceof ArrayBuffer ||
  value instanceof Date;

const inArgs = (args: readonly unknown[] | undefined): Result<InValue[], Error> => {
  const values = args ?? [];
  const invalid = values.find((value) => !isInValue(value));
  if (invalid !== undefined) {
    return err(new Error('Query argument is not a LibSQL value'));
  }
  return ok(values.flatMap((value) => (isInValue(value) ? [value] : [])));
};

const isRow = (row: unknown): row is Record<string, unknown> =>
  typeof row === 'object' && row !== null;

const toQueryResult = (result: {
  readonly rows: readonly unknown[];
  readonly rowsAffected: number;
  readonly lastInsertRowid?: number | bigint;
}): QueryResult => ({
  rows: result.rows.flatMap((row) => (isRow(row) ? [row] : [])),
  rowsAffected: result.rowsAffected,
  lastInsertRowid: result.lastInsertRowid ?? undefined,
});

const clientConfig = (config: DatabaseConfig, timeoutMs: number): Config => {
  switch (config.type) {
    case 'turso':
      return {
        url: config.url,
        authToken: config.authToken,
        fetch: fetchWithTimeout(timeoutMs),
      };
    case 'memory':
      return { url: ':memory:' };
    case 'file':
      return { url: `file:${config.path}` };
    default: {
      const _never: never = config;
      void _never;
      return { url: ':memory:' };
    }
  }
};

const settleCall = <T>(operation: () => Promise<T>): Promise<Result<T, unknown>> =>
  operation().then(
    (value) => ok(value),
    (error: unknown) => err(error)
  );

/**
 * Create a database connection based on the provided configuration.
 *
 * Supports three modes:
 * - `turso`: Connect to Turso cloud database (requires URL and auth token).
 *   Each call times out. A read is tried once more after a connection failure.
 *   A write is not retried, because the first request may already have committed.
 * - `file`: Local file-based SQLite via LibSQL
 * - `memory`: In-memory SQLite for tests
 */
export const createDatabase = (
  config: DatabaseConfig,
  options: DatabaseOptions = {}
): Database => {
  if (config.type === 'file') {
    mkdirSync(dirname(config.path), { recursive: true });
  }

  const timeoutMs = options.tursoCallTimeoutMs ?? TURSO_CALL_TIMEOUT_MS;
  const client = createClient(clientConfig(config, timeoutMs));
  const run = <T>(
    operation: () => Promise<T>,
    retry: boolean
  ): Promise<Result<T, unknown>> =>
    config.type === 'turso' ? runTursoCall(operation, { timeoutMs, retry }) : settleCall(operation);

  return {
    execute: async (query): Promise<QueryResult> => {
      const args = inArgs(query.args);
      if (args.isErr()) {
        return Promise.reject(args.error);
      }
      const settled = await run(
        () => client.execute({ sql: query.sql, args: [...args.value] }),
        query.access === 'read'
      );
      if (settled.isErr()) {
        return Promise.reject(settled.error);
      }
      return toQueryResult(settled.value);
    },

    batch: async (queries, mode = 'write'): Promise<QueryResult[]> => {
      const statements = queries.map((query) => ({
        sql: query.sql,
        args: inArgs(query.args),
      }));
      const invalid = statements.find((statement) => statement.args.isErr());
      if (invalid?.args.isErr()) {
        return Promise.reject(invalid.args.error);
      }
      const settled = await run(
        () =>
          client.batch(
            statements.flatMap((statement) =>
              statement.args.isOk()
                ? [{ sql: statement.sql, args: [...statement.args.value] }]
                : []
            ),
            mode
          ),
        mode === 'read'
      );
      if (settled.isErr()) {
        return Promise.reject(settled.error);
      }
      return settled.value.map(toQueryResult);
    },

    close: async () => {
      client.close();
    },
  };
};

export type { Database } from './types.js';
