import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client, type InValue } from '@libsql/client';
import type { WriteClient, WriteTransaction } from '../unit-of-work/sqlite-unit-of-work.js';
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

type Release = () => void;

/**
 * One libsql client is not safe for an open `transaction('write')` beside
 * `execute`. The native binding segfaults when those overlap. This gate
 * runs one turn at a time. A transaction holds its turn until `close`.
 */
const createClientGate = (): {
  acquire: () => Promise<Release>;
  exclusive: <T>(run: () => Promise<T>) => Promise<T>;
} => {
  let tail: Promise<void> = Promise.resolve();

  const acquire = (): Promise<Release> => {
    let release: Release = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const turn = tail.then(() => release);
    tail = released;
    return turn;
  };

  const exclusive = async <T>(run: () => Promise<T>): Promise<T> => {
    const release = await acquire();
    try {
      return await run();
    } finally {
      release();
    }
  };

  return { acquire, exclusive };
};

const mapResult = (result: {
  rows: unknown;
  rowsAffected: number;
  lastInsertRowid?: number | bigint | undefined;
}): QueryResult => ({
  rows: result.rows as Record<string, unknown>[],
  rowsAffected: result.rowsAffected,
  lastInsertRowid: result.lastInsertRowid ?? undefined,
});

const databaseFrom = (
  client: Client,
  gate: ReturnType<typeof createClientGate>
): Database => ({
  execute: (query): Promise<QueryResult> =>
    gate.exclusive(async () => {
      const result = await client.execute({
        sql: query.sql,
        args: (query.args ?? []) as InValue[],
      });
      return mapResult(result);
    }),

  batch: (queries, mode = 'write'): Promise<QueryResult[]> =>
    gate.exclusive(async () => {
      const results = await client.batch(
        queries.map((q) => ({
          sql: q.sql,
          args: (q.args ?? []) as InValue[],
        })),
        mode
      );
      return results.map((result) => mapResult(result));
    }),

  close: () =>
    gate.exclusive(async () => {
      client.close();
    }),
});

/**
 * File and memory clients. `client.transaction()` detaches the connection
 * and never closes it, so each commit leaks a native handle until the
 * process segfaults. `BEGIN` / `COMMIT` stay on the client's own connection.
 * The gate is already held, so these calls must not take it again.
 */
const sameConnectionTransaction = (
  client: Client,
  release: Release
): Promise<WriteTransaction> => {
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    release();
  };
  let open = false;
  const rollback = async (): Promise<void> => {
    if (!open) return;
    open = false;
    await client.execute('ROLLBACK');
  };

  return client.execute('BEGIN IMMEDIATE').then(
    () => {
      open = true;
      return {
        batch: async (statements) => {
          const results: { rowsAffected: number }[] = [];
          for (const statement of statements) {
            const result = await client.execute({
              sql: statement.sql,
              args: [...statement.args] as InValue[],
            });
            results.push({ rowsAffected: result.rowsAffected });
          }
          return results;
        },
        commit: async () => {
          await client.execute('COMMIT');
          open = false;
        },
        rollback,
        close: () => {
          try {
            if (open) {
              open = false;
              void client.execute('ROLLBACK').catch(() => undefined);
            }
          } finally {
            finish();
          }
        },
      };
    },
    async (error: unknown) => {
      finish();
      throw error;
    }
  );
};

/** Remote libsql. The interactive transaction is the protocol, not a leaked file handle. */
const remoteTransaction = async (
  client: Client,
  mode: 'write',
  release: Release
): Promise<WriteTransaction> => {
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    release();
  };
  try {
    const tx = await client.transaction(mode);
    return {
      batch: async (statements) => {
        const results = await tx.batch(
          statements.map((statement) => ({
            sql: statement.sql,
            args: [...statement.args] as InValue[],
          }))
        );
        return results.map((result) => ({ rowsAffected: result.rowsAffected }));
      },
      commit: () => tx.commit(),
      rollback: () => tx.rollback(),
      close: () => {
        try {
          tx.close();
        } finally {
          finish();
        }
      },
    };
  } catch (error) {
    finish();
    throw error;
  }
};

const gatedWriteClient = (
  client: Client,
  gate: ReturnType<typeof createClientGate>,
  remote: boolean
): WriteClient => ({
  transaction: async (mode): Promise<WriteTransaction> => {
    const release = await gate.acquire();
    if (remote) {
      return remoteTransaction(client, mode, release);
    }
    return sameConnectionTransaction(client, release);
  },
});

/**
 * One client for queries and for the unit of work. `writeClient` shares
 * that client's gate, so a transaction and a query do not overlap.
 * A second `:memory:` client is a different database.
 */
export const openDatabase = (
  config: DatabaseConfig
): {
  readonly database: Database;
  readonly client: Client;
  readonly writeClient: WriteClient;
} => {
  const client = createClientFor(config);
  const gate = createClientGate();
  return {
    database: databaseFrom(client, gate),
    client,
    writeClient: gatedWriteClient(client, gate, config.type === 'turso'),
  };
};

export const createDatabase = (config: DatabaseConfig): Database => openDatabase(config).database;

export type { Database } from './types.js';
