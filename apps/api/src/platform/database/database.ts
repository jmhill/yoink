import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client, type InValue } from '@libsql/client';
import type { WriteClient, WriteTransaction } from '../unit-of-work/sqlite-unit-of-work.js';
import type { DatabaseConfig } from '../config/schema.js';
import type { Database, QueryResult } from './types.js';
import { runTursoCall, TURSO_CALL_TIMEOUT_MS } from './run-turso-call.js';
import { fetchWithTimeout } from './turso-fetch.js';

export type DatabaseOptions = {
  readonly tursoCallTimeoutMs?: number;
};

/**
 * Create a database connection based on the provided configuration.
 *
 * Supports three modes:
 * - `turso`: Connect to Turso cloud database (requires URL and auth token).
 *   Each call times out. A read is tried once more after a connection failure.
 *   A write is not retried, because the first request may already have committed.
 * - `file`: Local file-based SQLite via LibSQL. Two connections, WAL, and
 *   `BEGIN IMMEDIATE` on the write connection. No Turso timeout.
 * - `memory`: In-memory SQLite for tests. One connection. No Turso timeout.
 */
const createClientFor = (config: DatabaseConfig, timeoutMs: number): Client => {
  switch (config.type) {
    case 'turso':
      return createClient({
        url: config.url,
        authToken: config.authToken,
        fetch: fetchWithTimeout(timeoutMs),
      });
    case 'memory':
      return createClient({ url: ':memory:' });
    case 'file':
      mkdirSync(dirname(config.path), { recursive: true });
      return createClient({ url: `file:${config.path}` });
  }
};

type DatabaseCall = <T>(operation: () => Promise<T>, retry: boolean) => Promise<T>;

const directCall: DatabaseCall = (operation) => operation();

const tursoCall =
  (timeoutMs: number): DatabaseCall =>
  async (operation, retry) => {
    const settled = await runTursoCall(operation, { timeoutMs, retry });
    if (settled.isErr()) {
      return Promise.reject(settled.error);
    }
    return settled.value;
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
  call: DatabaseCall,
  before?: () => Promise<void>
): Database => ({
  execute: (query): Promise<QueryResult> =>
    gate.exclusive(async () => {
      await before?.();
      const result = await call(
        () =>
          client.execute({
            sql: query.sql,
            args: (query.args ?? []) as InValue[],
          }),
        query.access === 'read'
      );
      return mapResult(result);
    }),

  batch: (queries, mode = 'write'): Promise<QueryResult[]> =>
    gate.exclusive(async () => {
      await before?.();
      const results = await call(
        () =>
          client.batch(
            queries.map((q) => ({
              sql: q.sql,
              args: (q.args ?? []) as InValue[],
            })),
            mode
          ),
        mode === 'read'
      );
      return results.map((result) => mapResult(result));
    }),

  migrate: (queries): Promise<QueryResult[]> =>
    gate.exclusive(async () => {
      await before?.();
      const results = await call(
        () =>
          client.migrate(
            queries.map((q) => ({
              sql: q.sql,
              args: (q.args ?? []) as InValue[],
            }))
          ),
        false
      );
      return results.map((result) => mapResult(result));
    }),

  close: () =>
    gate.exclusive(async () => {
      client.close();
    }),
});

/**
 * One connection, one statement at a time. A rollback queued while a
 * statement is in flight waits for that statement, then runs. Two executes
 * on this client overlap into a native segfault.
 */
const createOperationQueue = (): (<T>(run: () => Promise<T>) => Promise<T>) => {
  let tail: Promise<void> = Promise.resolve();
  return (run) => {
    const result = tail.then(run, run);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
};

/**
 * File and memory clients. `client.transaction()` detaches the connection
 * and never closes it, so each commit leaks a native handle until the
 * process segfaults. `BEGIN` / `COMMIT` stay on the client's own connection.
 * The gate is already held, so these calls must not take it again.
 * `close` rolls back when the transaction is still open, and releases the
 * gate only after that rollback settles. A rejected rollback still releases.
 */
export const beginSameConnectionTransaction = (
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
  let state: 'opening' | 'open' | 'committed' | 'closed' = 'opening';
  const enqueue = createOperationQueue();

  return Promise.resolve()
    .then(() => before?.())
    .then(() => client.execute('BEGIN IMMEDIATE'))
    .then(
      () => {
        state = 'open';
        return {
          batch: async (statements) => {
            const results: { rowsAffected: number }[] = [];
            for (const statement of statements) {
              const result = await enqueue(async () => {
                if (state !== 'open') {
                  throw new Error('transaction-closed');
                }
                return client.execute({
                  sql: statement.sql,
                  args: [...statement.args] as InValue[],
                });
              });
              results.push({ rowsAffected: result.rowsAffected });
            }
            return results;
          },
          commit: () =>
            enqueue(async () => {
              if (state !== 'open') return;
              await client.execute('COMMIT');
              state = 'committed';
            }),
          rollback: () =>
            enqueue(async () => {
              if (state !== 'open') return;
              await client.execute('ROLLBACK');
              state = 'closed';
            }),
          close: () =>
            enqueue(async () => {
              try {
                if (state === 'open') {
                  try {
                    await client.execute('ROLLBACK');
                  } catch {
                    // Release anyway. The next writer cannot share this connection
                    // with an in-flight statement, and a stuck gate stalls every write.
                  }
                  state = 'closed';
                }
              } finally {
                finish();
              }
            }),
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
    let open = true;
    const enqueue = createOperationQueue();
    return {
      batch: (statements) =>
        enqueue(async () => {
          if (!open) {
            throw new Error('transaction-closed');
          }
          const results = await tx.batch(
            statements.map((statement) => ({
              sql: statement.sql,
              args: [...statement.args] as InValue[],
            }))
          );
          return results.map((result) => ({ rowsAffected: result.rowsAffected }));
        }),
      commit: () =>
        enqueue(async () => {
          if (!open) return;
          await tx.commit();
          open = false;
        }),
      rollback: () =>
        enqueue(async () => {
          if (!open) return;
          await tx.rollback();
          open = false;
        }),
      close: () =>
        enqueue(async () => {
          try {
            if (open) {
              try {
                await tx.rollback();
              } catch {
                // The handle still has to close so the gate can release.
              }
              open = false;
            }
            tx.close();
          } finally {
            finish();
          }
        }),
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
    return beginSameConnectionTransaction(client, release, before);
  },
});

/**
 * File databases use two connections to the same file. Queries keep their
 * own gate, so a signup read is not queued behind every open commit.
 * `:memory:` cannot do that: a second client is a different database, so
 * memory and remote share one connection and one gate.
 */
export const openDatabase = (
  config: DatabaseConfig,
  options: DatabaseOptions = {}
): {
  readonly database: Database;
  readonly client: Client;
  readonly writeClient: WriteClient;
} => {
  const timeoutMs = options.tursoCallTimeoutMs ?? TURSO_CALL_TIMEOUT_MS;
  const call = config.type === 'turso' ? tursoCall(timeoutMs) : directCall;

  if (config.type !== 'file') {
    const client = createClientFor(config, timeoutMs);
    const gate = createClientGate();
    return {
      database: databaseFrom(client, gate, call),
      client,
      writeClient: gatedWriteClient(client, gate, config.type === 'turso'),
    };
  }

  const readClient = createClientFor(config, timeoutMs);
  const writeNative = createClientFor(config, timeoutMs);
  const readGate = createClientGate();
  const writeGate = createClientGate();
  const database = databaseFrom(readClient, readGate, call, journalWal(readClient));
  return {
    database: {
      execute: database.execute,
      batch: database.batch,
      migrate: database.migrate,
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

export const createDatabase = (
  config: DatabaseConfig,
  options: DatabaseOptions = {}
): Database => openDatabase(config, options).database;

export type { Database } from './types.js';
