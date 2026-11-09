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
 * One libsql client is not safe for an open transaction beside `execute`.
 * The native binding segfaults when those overlap. This gate runs one turn
 * at a time on that client. A transaction holds its turn until `close`.
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

const journalWal = (client: Client): (() => Promise<void>) => {
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= client
      .execute('PRAGMA busy_timeout = 5000')
      .then(() => client.execute('PRAGMA journal_mode = WAL'))
      .then(() => undefined);
    return pending;
  };
};

const databaseFrom = (
  client: Client,
  gate: ReturnType<typeof createClientGate>,
  before?: () => Promise<void>
): Database => ({
  execute: (query): Promise<QueryResult> =>
    gate.exclusive(async () => {
      await before?.();
      const result = await client.execute({
        sql: query.sql,
        args: (query.args ?? []) as InValue[],
      });
      return mapResult(result);
    }),

  batch: (queries, mode = 'write'): Promise<QueryResult[]> =>
    gate.exclusive(async () => {
      await before?.();
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
  release: Release,
  before?: () => Promise<void>
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

  return Promise.resolve()
    .then(() => before?.())
    .then(() => client.execute('BEGIN IMMEDIATE'))
    .then(
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
  remote: boolean,
  before?: () => Promise<void>
): WriteClient => ({
  transaction: async (mode): Promise<WriteTransaction> => {
    const release = await gate.acquire();
    if (remote) {
      return remoteTransaction(client, mode, release);
    }
    return sameConnectionTransaction(client, release, before);
  },
});

/**
 * File databases use two connections to the same file. Queries keep their
 * own gate, so a signup read is not queued behind every open commit.
 * `:memory:` cannot do that: a second client is a different database, so
 * memory and remote share one connection and one gate.
 */
export const openDatabase = (
  config: DatabaseConfig
): {
  readonly database: Database;
  readonly client: Client;
  readonly writeClient: WriteClient;
} => {
  if (config.type !== 'file') {
    const client = createClientFor(config);
    const gate = createClientGate();
    return {
      database: databaseFrom(client, gate),
      client,
      writeClient: gatedWriteClient(client, gate, config.type === 'turso'),
    };
  }

  const readClient = createClientFor(config);
  const writeNative = createClientFor(config);
  const readGate = createClientGate();
  const writeGate = createClientGate();
  const database = databaseFrom(readClient, readGate, journalWal(readClient));
  return {
    database: {
      execute: database.execute,
      batch: database.batch,
      close: async () => {
        await database.close();
        const release = await writeGate.acquire();
        try {
          writeNative.close();
        } finally {
          release();
        }
      },
    },
    client: readClient,
    writeClient: gatedWriteClient(writeNative, writeGate, false, journalWal(writeNative)),
  };
};

export const createDatabase = (config: DatabaseConfig): Database => openDatabase(config).database;

export type { Database } from './types.js';
