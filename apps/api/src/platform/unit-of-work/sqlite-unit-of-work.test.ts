import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { err, errAsync, ok, okAsync, ResultAsync, type Result } from 'neverthrow';
import type { IntegrationEvent } from '../../kernel/integration-event.js';
import type { ModuleName } from '../../kernel/module-name.js';
import type {
  GuardedStatement,
  Policy,
  PolicyRefusal,
  SqlParticipant,
  Work,
  WriteVerb,
} from '../../kernel/unit-of-work.js';
import { openDatabase } from '../database/database.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
  UNIT_OF_WORK_SLOW_TRANSACTION_MS,
  UNIT_OF_WORK_TRANSACTION_TIMEOUT_MS,
  type UnitOfWorkLogger,
  type WriteClient,
  type WriteTransaction,
} from './sqlite-unit-of-work.js';
import { acceptedWrite } from './write-statement.js';

const event = (type: string): IntegrationEvent => ({
  id: `${type}-id`,
  type,
  schemaVersion: 1,
  organizationId: 'org',
  occurredAt: '2026-11-07T00:00:00.000Z',
  actor: { kind: 'user', userId: 'user', via: 'session' },
  subject: { type: 'task', id: 'task-1' },
  payload: {},
});

const OK = 'INSERT INTO kept (id) VALUES (?)';
const MISS = 'UPDATE kept SET id = id WHERE 0 /*miss*/';
const THROW = 'DELETE FROM kept WHERE 0 /*throw*/';
const AFTER = 'INSERT INTO kept (id) VALUES (?) /*after*/';
const POLICY = 'UPDATE kept SET id = id WHERE 1 /*policy*/';

const verbFor = (sql: string): WriteVerb => {
  const match = /^\s*(insert|update|delete)\b/i.exec(sql);
  const verb = match?.[1]?.toLowerCase();
  if (verb === 'update' || verb === 'delete') {
    return verb;
  }
  return 'insert';
};

const statement = (
  sql: string,
  args: readonly unknown[] = [],
  guard = false
): GuardedStatement => ({ verb: verbFor(sql), sql, args, guard });

const work = (
  owner: ModuleName,
  plan: GuardedStatement,
  types: readonly string[] = []
): Work<null> => ({
  result: null,
  events: types.map((type) => event(type)),
  step: { owner, plan },
});

const passthrough = (owner: ModuleName): SqlParticipant<unknown> => ({
  owner,
  compile: (plan) => [plan as GuardedStatement],
});

const LEAKED_SECRET = 'sk_live_do_not_log';

type Calls = {
  modes: string[];
  sql: string[];
  batches: number;
  commit: number;
  rollback: number;
  close: number;
};

type BatchLog = {
  readonly msg: 'unit_of_work_batch_failed';
  readonly reason: string;
  readonly owners: readonly string[];
  readonly batchSize: number;
  readonly cause: string;
};

const scripted = (options?: {
  readonly failOpen?: boolean;
  readonly failCommit?: boolean;
  readonly failRollback?: boolean;
  readonly failClose?: boolean;
}): { readonly client: WriteClient; readonly calls: Calls } => {
  const calls: Calls = { modes: [], sql: [], batches: 0, commit: 0, rollback: 0, close: 0 };
  const client: WriteClient = {
    transaction: (mode) => {
      if (options?.failOpen) {
        return Promise.reject(new Error('open failed'));
      }
      calls.modes.push(mode);
      const tx: WriteTransaction = {
        batch: (statements) => {
          calls.batches += 1;
          for (const step of statements) {
            calls.sql.push(step.sql);
          }
          if (statements.some((step) => step.sql.includes('/*throw*/'))) {
            const error = new Error(
              `CHECK constraint failed: secret-arg=${LEAKED_SECRET}`
            );
            error.name = 'LibsqlError';
            return Promise.reject(
              Object.assign(error, {
                code: 'SQLITE_CONSTRAINT',
                rawCode: null,
                index: null,
                sql: statements.map((step) => step.sql).join(';'),
                args: [LEAKED_SECRET],
              })
            );
          }
          return Promise.resolve(
            statements.map((step) => ({
              rowsAffected: step.sql.includes('/*miss*/') ? 0 : 1,
            }))
          );
        },
        commit: () => {
          calls.commit += 1;
          if (options?.failCommit) {
            return Promise.reject(new Error('commit failed'));
          }
          return Promise.resolve();
        },
        rollback: () => {
          calls.rollback += 1;
          if (options?.failRollback) {
            return Promise.reject(new Error('rollback failed'));
          }
          return Promise.resolve();
        },
        close: () => {
          calls.close += 1;
          if (options?.failClose) {
            throw new Error('close failed');
          }
        },
      };
      return Promise.resolve(tx);
    },
  };
  return { client, calls };
};

const keysOf = (value: object): string[] => Object.keys(value).sort();

describe('acceptedWrite', () => {
  it('rejects reads hidden by comments, a CTE, or parentheses', () => {
    const rejected = [
      '/*c*/ SELECT 1',
      '-- note\nSELECT 1',
      'WITH c AS (SELECT 1) SELECT 1',
      '(SELECT 1)',
      'SELECT 1',
      'PRAGMA foreign_keys',
      'EXPLAIN SELECT 1',
      'INSERT INTO kept (id) VALUES (1); SELECT 1',
      'WITH c AS (SELECT 1) INSERT INTO kept (id) SELECT 1',
      '/* unclosed SELECT',
      'selected_note',
    ];
    for (const sql of rejected) {
      expect(acceptedWrite(statement(sql))).toBe(false);
    }
  });

  it('accepts one insert, update, or delete, including INSERT ... SELECT', () => {
    const accepted = [
      'INSERT INTO parents (id) VALUES (?)',
      '  UPDATE parents SET status = ? WHERE id = ?',
      'DELETE FROM tasks WHERE id = ?',
      'INSERT OR IGNORE INTO organizations (id) VALUES (?)',
      "INSERT INTO kept (name) VALUES ('a; SELECT 1')",
      'INSERT INTO kept (id) VALUES (1);',
      '/*c*/ INSERT INTO kept (id) VALUES (1)',
      '-- note\nINSERT INTO kept (id) VALUES (?)',
      `INSERT INTO change_log (id, seq)
       SELECT ?, COALESCE((SELECT MAX(seq) FROM change_log), 0) + 1
       WHERE EXISTS (SELECT 1 FROM tasks WHERE id = ?)`,
      'INSERT INTO kept (id) VALUES (1) -- ; SELECT 1',
      'INSERT INTO kept (id) VALUES (1) /* ; SELECT 1 */',
    ];
    for (const sql of accepted) {
      expect(acceptedWrite(statement(sql))).toBe(true);
    }
  });

  it('rejects a write whose declared verb does not match the text', () => {
    expect(
      acceptedWrite({
        verb: 'delete',
        sql: 'INSERT INTO kept (id) VALUES (?)',
        args: [],
        guard: false,
      })
    ).toBe(false);
  });
});

describe('createSqliteUnitOfWork protocol', () => {
  const participants = [passthrough('captures'), passthrough('task-management')];

  it('rejects two participants for one module', () => {
    const { client } = scripted();
    expect(() =>
      createSqliteUnitOfWork({
        client,
        participants: [passthrough('captures'), passthrough('captures')],
      })
    ).toThrow('Duplicate unit-of-work participant: captures');
  });

  it('commits on transaction write, then closes, and does not roll back', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement(OK)),
    ]);

    expect(result.isOk()).toBe(true);
    expect(calls.modes).toEqual(['write']);
    expect(calls.batches).toBe(1);
    expect(calls.sql).toEqual([OK]);
    expect(calls.commit).toBe(1);
    expect(calls.rollback).toBe(0);
    expect(calls.close).toBe(1);
  });

  it('does not open a transaction when there is nothing to run', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({
      client,
      participants,
    }).commit([]);

    expect(result.isOk()).toBe(true);
    expect(calls.modes).toEqual([]);
  });

  it('maps a mixed-owner guard miss to Conflict for that statement and rolls the batch back', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement(OK)),
      work('task-management', statement(MISS, [], true)),
      work('captures', statement(AFTER)),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Conflict',
        owner: 'task-management',
        reason: 'guard-miss',
      });
      expect(keysOf(result.error)).toEqual(['kind', 'owner', 'reason']);
    }
    expect(calls.batches).toBe(1);
    expect(calls.sql).toEqual([OK, MISS, AFTER]);
    expect(calls.commit).toBe(0);
    expect(calls.rollback).toBe(1);
    expect(calls.close).toBe(1);
  });

  it('commits an unguarded write that changed no rows', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement(MISS, [], false)),
    ]);

    expect(result.isOk()).toBe(true);
    expect(calls.commit).toBe(1);
    expect(calls.rollback).toBe(0);
  });

  it('maps a mixed-owner batch throw to Storage with no owner and does not log the driver message', async () => {
    const { client, calls } = scripted();
    const logs: BatchLog[] = [];
    const result = await createSqliteUnitOfWork({
      client,
      participants,
      logger: { error: (fields) => logs.push(fields) },
    }).commit([
      work('captures', statement(OK, [LEAKED_SECRET])),
      work('task-management', statement(THROW)),
      work('captures', statement(AFTER)),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owners: ['captures', 'task-management'],
        reason: 'execute-failed',
      });
      expect(keysOf(result.error)).toEqual(['kind', 'owners', 'reason']);
      expect(result.error).not.toHaveProperty('code');
      expect(result.error).not.toHaveProperty('rawCode');
      expect(result.error).not.toHaveProperty('index');
    }
    expect(calls.batches).toBe(1);
    expect(calls.sql).toEqual([OK, THROW, AFTER]);
    expect(calls.commit).toBe(0);
    expect(calls.rollback).toBe(1);
    expect(calls.close).toBe(1);
    expect(logs).toEqual([
      {
        msg: 'unit_of_work_batch_failed',
        reason: 'execute-failed',
        owners: ['captures', 'task-management'],
        batchSize: 3,
        cause: 'LibsqlError',
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain(LEAKED_SECRET);
    expect(JSON.stringify(logs)).not.toContain('CHECK constraint');
    expect(JSON.stringify(logs)).not.toContain('SQLITE_CONSTRAINT');
    expect(JSON.stringify(logs)).not.toContain(OK);
  });

  it('maps a single-owner batch throw to Storage with owner and owners', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({
      client,
      participants: [passthrough('captures')],
    }).commit([work('captures', statement(THROW))]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owner: 'captures',
        owners: ['captures'],
        reason: 'execute-failed',
      });
      expect(keysOf(result.error)).toEqual(['kind', 'owner', 'owners', 'reason']);
    }
    expect(calls.batches).toBe(1);
    expect(calls.rollback).toBe(1);
    expect(calls.commit).toBe(0);
  });

  it('closes when rollback throws and still does not commit', async () => {
    const { client, calls } = scripted({ failRollback: true });
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement(MISS, [], true)),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Conflict',
        owner: 'captures',
        reason: 'guard-miss',
      });
    }
    expect(calls.commit).toBe(0);
    expect(calls.rollback).toBe(1);
    expect(calls.close).toBe(1);
  });

  it('keeps the step failure when close throws after rollback', async () => {
    const { client, calls } = scripted({ failClose: true });
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement(THROW)),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('Storage');
    }
    expect(calls.commit).toBe(0);
    expect(calls.close).toBe(1);
  });

  it('reports commit failure after the write transaction is abandoned', async () => {
    const { client, calls } = scripted({ failCommit: true });
    const result = await createSqliteUnitOfWork({
      client,
      participants: [passthrough('captures')],
    }).commit([work('captures', statement(OK))]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owner: 'captures',
        owners: ['captures'],
        reason: 'commit-failed',
      });
    }
    expect(calls.commit).toBe(1);
    expect(calls.rollback).toBe(1);
    expect(calls.close).toBe(1);
  });

  it('returns ok when close throws after a successful commit', async () => {
    const { client, calls } = scripted({ failClose: true });
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement(OK)),
    ]);

    expect(result.isOk()).toBe(true);
    expect(calls.commit).toBe(1);
    expect(calls.rollback).toBe(0);
    expect(calls.close).toBe(1);
  });

  it('does not commit when opening the transaction throws', async () => {
    const { client, calls } = scripted({ failOpen: true });
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement(OK)),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owner: 'captures',
        owners: ['captures'],
        reason: 'transaction-failed',
      });
    }
    expect(calls.commit).toBe(0);
    expect(calls.rollback).toBe(0);
  });

  it('rejects a later read without opening a transaction', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement(OK)),
      work('task-management', statement('SELECT 1')),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owners: ['captures', 'task-management'],
        reason: 'read-rejected',
      });
      expect('owner' in result.error).toBe(false);
    }
    expect(calls.modes).toEqual([]);
    expect(calls.sql).toEqual([]);
  });

  it('rejects a read before a transaction starts', async () => {
    const { client, calls } = scripted();
    const selected = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement('SELECT 1')),
    ]);
    const pragma = await createSqliteUnitOfWork({ client, participants }).commit([
      work('task-management', statement('PRAGMA foreign_keys')),
    ]);

    expect(selected.isErr()).toBe(true);
    if (selected.isErr()) {
      expect(selected.error).toEqual({
        kind: 'Storage',
        owner: 'captures',
        owners: ['captures'],
        reason: 'read-rejected',
      });
    }
    expect(pragma.isErr()).toBe(true);
    if (pragma.isErr()) {
      expect(pragma.error).toEqual({
        kind: 'Storage',
        owner: 'task-management',
        owners: ['task-management'],
        reason: 'read-rejected',
      });
    }
    expect(calls.modes).toEqual([]);
  });

  it('rejects comment, CTE, and parenthesized reads before opening a transaction', async () => {
    const hidden = [
      '/*c*/ SELECT 1',
      '-- note\nSELECT 1',
      'WITH c AS (SELECT 1) SELECT 1',
      '(SELECT 1)',
      'INSERT INTO kept (id) VALUES (1); SELECT 1',
    ];
    const { client, calls } = scripted();
    const uow = createSqliteUnitOfWork({ client, participants });

    for (const sql of hidden) {
      const result = await uow.commit([
        work('captures', statement(OK)),
        work('task-management', statement(sql)),
      ]);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toEqual({
          kind: 'Storage',
          owners: ['captures', 'task-management'],
          reason: 'read-rejected',
        });
      }
    }
    expect(calls.modes).toEqual([]);
    expect(calls.sql).toEqual([]);
  });

  it('names a missing participant and does not open a transaction', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('notes', statement(OK)),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owner: 'notes',
        owners: ['notes'],
        reason: 'no-participant',
      });
    }
    expect(calls.modes).toEqual([]);
  });

  it('stops on a policy refusal before any transaction', async () => {
    const { client, calls } = scripted();
    const policies: readonly Policy[] = [
      {
        on: 'TaskDeleted',
        react: () => errAsync({ kind: 'Refused', reason: 'capture-already-gone' }),
      },
    ];
    const result = await createSqliteUnitOfWork({ client, participants, policies }).commit([
      work('captures', statement(OK), ['TaskDeleted']),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Refused',
        reason: 'capture-already-gone',
      });
    }
    expect(calls.modes).toEqual([]);
  });

  it('runs policy work in the same transaction and does not chain policies', async () => {
    const seen: string[] = [];
    const policies: readonly Policy[] = [
      {
        on: 'TaskDeleted',
        react: () => {
          seen.push('delete-capture');
          return okAsync(work('task-management', statement(POLICY), ['CaptureDeleted']));
        },
      },
      {
        on: 'CaptureDeleted',
        react: () => {
          seen.push('again');
          return okAsync(work('captures', statement('DELETE FROM kept WHERE 1 /*again*/')));
        },
      },
    ];
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants, policies }).commit([
      work('captures', statement(OK), ['TaskDeleted']),
    ]);

    expect(result.isOk()).toBe(true);
    expect(seen).toEqual(['delete-capture']);
    expect(calls.modes).toEqual(['write']);
    expect(calls.sql).toEqual([OK, POLICY]);
    expect(calls.commit).toBe(1);
  });

  it('does not open a transaction while a policy is still running', async () => {
    let releasePolicy: () => void = () => undefined;
    const policyGate = new Promise<void>((resolve) => {
      releasePolicy = resolve;
    });
    const policies: readonly Policy[] = [
      {
        on: 'TaskDeleted',
        react: () => new ResultAsync(policyGate.then(() => ok(null))),
      },
    ];
    const { client, calls } = scripted();
    const pending = createSqliteUnitOfWork({ client, participants, policies }).commit([
      work('captures', statement(OK), ['TaskDeleted']),
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.modes).toEqual([]);
    releasePolicy();
    const result = await pending;
    expect(result.isOk()).toBe(true);
    expect(calls.modes).toEqual(['write']);
  });

  it('does not open a transaction when a policy rejects', async () => {
    const policies: readonly Policy[] = [
      {
        on: 'TaskDeleted',
        react: () => new ResultAsync(Promise.reject(new Error('policy blew up'))),
      },
    ];
    const { client, calls } = scripted();

    await expect(
      createSqliteUnitOfWork({ client, participants, policies }).commit([
        work('captures', statement(OK), ['TaskDeleted']),
      ])
    ).rejects.toThrow('policy blew up');
    expect(calls.modes).toEqual([]);
  });
});

describe('unit of work transaction deadline', () => {
  const participants = [passthrough('captures'), passthrough('task-management')];

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('uses a five second deadline and a one second slow warning', () => {
    expect(UNIT_OF_WORK_TRANSACTION_TIMEOUT_MS).toBe(5_000);
    expect(UNIT_OF_WORK_SLOW_TRANSACTION_MS).toBe(1_000);
  });

  it('rolls back and does not commit when the batch outlives the deadline', async () => {
    vi.useFakeTimers();
    let releaseBatch: (rows: readonly { rowsAffected: number }[]) => void = () => undefined;
    const calls = { commit: 0, rollback: 0, close: 0 };
    const logs: BatchLog[] = [];
    const client: WriteClient = {
      transaction: () => {
        const tx: WriteTransaction = {
          batch: () =>
            new Promise((resolve) => {
              releaseBatch = resolve;
            }),
          commit: () => {
            calls.commit += 1;
            return Promise.resolve();
          },
          rollback: () => {
            calls.rollback += 1;
            return Promise.resolve();
          },
          close: () => {
            calls.close += 1;
          },
        };
        return Promise.resolve(tx);
      },
    };
    const resultPromise = createSqliteUnitOfWork({
      client,
      participants,
      transactionTimeoutMs: 20,
      slowTransactionMs: 1_000,
      clock: { now: () => 0 },
      logger: { error: (fields) => logs.push(fields) },
    }).commit([
      work('captures', statement(OK, [LEAKED_SECRET])),
      work('task-management', statement(AFTER, [LEAKED_SECRET])),
    ]);

    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owners: ['captures', 'task-management'],
        reason: 'transaction-timeout',
      });
      expect(keysOf(result.error)).toEqual(['kind', 'owners', 'reason']);
    }
    expect(calls.commit).toBe(0);
    expect(calls.rollback).toBe(1);
    expect(calls.close).toBe(1);
    expect(logs).toEqual([
      {
        msg: 'unit_of_work_batch_failed',
        reason: 'transaction-timeout',
        owners: ['captures', 'task-management'],
        batchSize: 2,
        cause: 'Error',
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain(LEAKED_SECRET);
    expect(JSON.stringify(logs)).not.toContain(OK);

    releaseBatch([{ rowsAffected: 1 }, { rowsAffected: 1 }]);
    await Promise.resolve();
    expect(calls.commit).toBe(0);
  });

  it('names the only owner when that batch times out', async () => {
    vi.useFakeTimers();
    const calls = { commit: 0, rollback: 0, close: 0 };
    const client: WriteClient = {
      transaction: () =>
        Promise.resolve({
          batch: () => new Promise(() => undefined),
          commit: () => {
            calls.commit += 1;
            return Promise.resolve();
          },
          rollback: () => {
            calls.rollback += 1;
            return Promise.resolve();
          },
          close: () => {
            calls.close += 1;
          },
        }),
    };

    const resultPromise = createSqliteUnitOfWork({
      client,
      participants: [passthrough('captures')],
      transactionTimeoutMs: 20,
      clock: { now: () => 0 },
    }).commit([work('captures', statement(OK)), work('captures', statement(AFTER))]);
    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owner: 'captures',
        owners: ['captures'],
        reason: 'transaction-timeout',
      });
    }
    expect(calls.commit).toBe(0);
    expect(calls.rollback).toBe(1);
    expect(calls.close).toBe(1);
  });

  it('warns with owners, statement count, and duration, and leaves parameters out', async () => {
    let now = 0;
    const warns: Parameters<NonNullable<UnitOfWorkLogger['warn']>>[0][] = [];
    const { client } = scripted();
    const clock = {
      now: () => now,
    };
    const loggingClient: WriteClient = {
      transaction: async (mode) => {
        const tx = await client.transaction(mode);
        return {
          ...tx,
          batch: async (statements) => {
            now = 1_500;
            return tx.batch(statements);
          },
        };
      },
    };

    const result = await createSqliteUnitOfWork({
      client: loggingClient,
      participants: [passthrough('captures')],
      clock,
      slowTransactionMs: 1_000,
      transactionTimeoutMs: 60_000,
      logger: { error: () => undefined, warn: (fields) => warns.push(fields) },
    }).commit([
      work('captures', statement(OK, [LEAKED_SECRET])),
      work('captures', statement(AFTER, [LEAKED_SECRET])),
    ]);

    expect(result.isOk()).toBe(true);
    expect(warns).toEqual([
      {
        msg: 'unit_of_work_transaction_slow',
        owners: ['captures'],
        statementCount: 2,
        durationMs: 1_500,
      },
    ]);
    expect(JSON.stringify(warns)).not.toContain(LEAKED_SECRET);
    expect(JSON.stringify(warns)).not.toContain('INSERT');
  });

  it('does not warn when the transaction finishes under the threshold', async () => {
    const warns: string[] = [];
    const { client } = scripted();
    const result = await createSqliteUnitOfWork({
      client,
      participants,
      clock: { now: () => 0 },
      slowTransactionMs: 1_000,
      logger: { error: () => undefined, warn: () => warns.push('slow') },
    }).commit([work('captures', statement(OK))]);

    expect(result.isOk()).toBe(true);
    expect(warns).toEqual([]);
  });
});

describe('unit of work write lock', () => {
  it('lets a policy commit finish before the outer transaction opens', async () => {
    const root = mkdtempSync(join(tmpdir(), 'yoink-uow-lock-'));
    const opened = openDatabase({ type: 'file', path: join(root, 'lock.db') });
    try {
      await opened.database.execute({
        sql: 'CREATE TABLE kept (id TEXT PRIMARY KEY)',
      });
      const participants = [passthrough('captures')];
      let uow: ReturnType<typeof createSqliteUnitOfWork> | undefined;
      const policies: readonly Policy[] = [
        {
          on: 'TaskDeleted',
          react: () =>
            new ResultAsync(
              (async (): Promise<Result<Work<unknown> | null, PolicyRefusal>> => {
                const nested = uow?.commit([
                  work('captures', statement('INSERT INTO kept (id) VALUES (?)', ['inner'])),
                ]);
                if (nested === undefined) {
                  return err({ kind: 'Refused', reason: 'missing-uow' });
                }
                const result = await nested;
                if (result.isErr()) {
                  return err({ kind: 'Refused', reason: 'nested-commit' });
                }
                return ok(null);
              })()
            ),
        },
      ];
      uow = createSqliteUnitOfWork({
        client: opened.writeClient,
        participants,
        policies,
        transactionTimeoutMs: 500,
      });

      const result = await uow.commit([
        work('captures', statement('INSERT INTO kept (id) VALUES (?)', ['outer']), ['TaskDeleted']),
      ]);

      expect(result.isOk()).toBe(true);
      const rows = await opened.database.execute({
        sql: 'SELECT id FROM kept ORDER BY id',
      });
      expect(rows.rows.map((row) => row.id)).toEqual(['inner', 'outer']);
    } finally {
      await opened.database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rolls a stalled file transaction back and lets the next write commit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'yoink-uow-stall-'));
    const opened = openDatabase({ type: 'file', path: join(root, 'stall.db') });
    let releaseStall: () => void = () => undefined;
    const stall = new Promise<void>((resolve) => {
      releaseStall = resolve;
    });
    let stalled = true;
    try {
      await opened.database.execute({
        sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)',
      });
      const client: WriteClient = {
        transaction: async (mode) => {
          const tx = await opened.writeClient.transaction(mode);
          return {
            batch: async (statements) => {
              if (stalled) {
                stalled = false;
                await stall;
              }
              return tx.batch(statements);
            },
            commit: () => tx.commit(),
            rollback: () => tx.rollback(),
            close: () => tx.close(),
          };
        },
      };
      const uow = createSqliteUnitOfWork({
        client,
        participants: [passthrough('captures')],
        transactionTimeoutMs: 50,
        slowTransactionMs: 60_000,
      });
      const timedOut = await uow.commit([
        work('captures', statement('INSERT INTO notes (body) VALUES (?)', ['stalled'])),
      ]);

      expect(timedOut.isErr()).toBe(true);
      if (timedOut.isErr()) {
        expect(timedOut.error).toEqual({
          kind: 'Storage',
          owner: 'captures',
          owners: ['captures'],
          reason: 'transaction-timeout',
        });
      }

      releaseStall();
      await Promise.resolve();
      const next = await uow.commit([
        work('captures', statement('INSERT INTO notes (body) VALUES (?)', ['next'])),
      ]);
      expect(next.isOk()).toBe(true);
      const rows = await opened.database.execute({
        sql: 'SELECT body FROM notes ORDER BY id',
      });
      expect(rows.rows.map((row) => row.body)).toEqual(['next']);
    } finally {
      releaseStall();
      await opened.database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('libsql write transaction', () => {
  it('commits INSERT ... SELECT and leaves a hidden read unexecuted', async () => {
    await withFile(async (raw) => {
      await raw.execute('CREATE TABLE parents (id TEXT PRIMARY KEY, status TEXT NOT NULL)');
      const calls = { commit: 0, rollback: 0, close: 0, modes: [] as string[], batches: 0, statements: 0 };
      const uow = createSqliteUnitOfWork({
        client: record(libsqlWriteClient(raw), calls),
        participants: [passthrough('captures'), passthrough('task-management')],
      });

      const wrote = await uow.commit([
        work(
          'captures',
          statement(
            `INSERT INTO parents (id, status)
             SELECT ?, ?
             WHERE NOT EXISTS (SELECT 1 FROM parents WHERE id = ?)`,
            ['s', 'open', 's']
          )
        ),
      ]);
      expect(wrote.isOk()).toBe(true);
      expect(await ids(raw, 'parents')).toEqual(['s']);

      const hidden = await uow.commit([work('task-management', statement('/*c*/ SELECT 1'))]);
      expect(hidden.isErr()).toBe(true);
      if (hidden.isErr()) {
        expect(hidden.error).toEqual({
          kind: 'Storage',
          owner: 'task-management',
          owners: ['task-management'],
          reason: 'read-rejected',
        });
      }
      expect(calls.modes).toEqual(['write']);
      expect(calls.commit).toBe(1);
      expect(calls.rollback).toBe(0);
    });
  });

  it('enforces foreign keys and rolls the transaction back', async () => {
    await withFile(async (raw) => {
      const pragma = await raw.execute('PRAGMA foreign_keys');
      expect(pragma.columns).toEqual(['foreign_keys']);
      expect(pragma.rows[0]?.foreign_keys).toBe(1);

      await raw.execute(
        'CREATE TABLE parents (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT \'open\')'
      );
      await raw.execute(
        'CREATE TABLE children (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parents(id))'
      );
      await raw.execute({
        sql: 'INSERT INTO parents (id, status) VALUES (?, ?)',
        args: ['p', 'open'],
      });

      const calls = { commit: 0, rollback: 0, close: 0, modes: [] as string[], batches: 0, statements: 0 };
      const logs: BatchLog[] = [];
      const client = record(libsqlWriteClient(raw), calls);
      const uow = createSqliteUnitOfWork({
        client,
        participants: [passthrough('captures'), passthrough('notes'), passthrough('task-management')],
        logger: { error: (fields) => logs.push(fields) },
      });

      const missed = await uow.commit([
        work('captures', statement('INSERT INTO parents (id, status) VALUES (?, ?)', ['extra', 'open'])),
        work(
          'task-management',
          statement('UPDATE parents SET status = ? WHERE id = ? AND status = ?', ['done', 'missing', 'open'], true)
        ),
        work('notes', statement('INSERT INTO children (id, parent_id) VALUES (?, ?)', ['late', 'p'])),
      ]);

      expect(missed.isErr()).toBe(true);
      if (missed.isErr()) {
        expect(missed.error).toEqual({
          kind: 'Conflict',
          owner: 'task-management',
          reason: 'guard-miss',
        });
      }
      expect(calls.commit).toBe(0);
      expect(calls.rollback).toBe(1);
      expect(calls.close).toBe(1);
      expect(calls.modes).toEqual(['write']);
      expect(await ids(raw, 'parents')).toEqual(['p']);
      expect(await ids(raw, 'children')).toEqual([]);

      const duplicate = await uow.commit([
        work('captures', statement('INSERT INTO parents (id, status) VALUES (?, ?)', ['temp', 'open'])),
        work('task-management', statement('INSERT INTO parents (id, status) VALUES (?, ?)', ['p', 'open'])),
      ]);
      expect(duplicate.isErr()).toBe(true);
      if (duplicate.isErr()) {
        expect(duplicate.error).toEqual({
          kind: 'Storage',
          owners: ['captures', 'task-management'],
          reason: 'execute-failed',
        });
        expect(keysOf(duplicate.error)).toEqual(['kind', 'owners', 'reason']);
        expect('owner' in duplicate.error).toBe(false);
      }
      expect(await ids(raw, 'parents')).toEqual(['p']);

      const single = await uow.commit([
        work('captures', statement('INSERT INTO parents (id, status) VALUES (?, ?)', ['solo', 'open'])),
        work('captures', statement('INSERT INTO parents (id, status) VALUES (?, ?)', ['solo', 'open'])),
      ]);
      expect(single.isErr()).toBe(true);
      if (single.isErr()) {
        expect(single.error).toEqual({
          kind: 'Storage',
          owner: 'captures',
          owners: ['captures'],
          reason: 'execute-failed',
        });
      }
      expect(await ids(raw, 'parents')).toEqual(['p']);

      const dangling = await uow.commit([
        work('captures', statement('INSERT INTO parents (id, status) VALUES (?, ?)', ['q', 'open'])),
        work('notes', statement('INSERT INTO children (id, parent_id) VALUES (?, ?)', ['child', 'missing'])),
      ]);
      expect(dangling.isErr()).toBe(true);
      if (dangling.isErr()) {
        expect(dangling.error).toEqual({
          kind: 'Storage',
          owners: ['captures', 'notes'],
          reason: 'execute-failed',
        });
        expect('owner' in dangling.error).toBe(false);
      }
      expect(await ids(raw, 'parents')).toEqual(['p']);
      expect(await ids(raw, 'children')).toEqual([]);

      const committed = await uow.commit([
        work('captures', statement('INSERT INTO parents (id, status) VALUES (?, ?)', ['r', 'open'])),
        work('notes', statement('INSERT INTO children (id, parent_id) VALUES (?, ?)', ['child', 'r'])),
        work(
          'task-management',
          statement('UPDATE parents SET status = ? WHERE id = ? AND status = ?', ['done', 'p', 'open'], true)
        ),
      ]);
      expect(committed.isOk()).toBe(true);
      expect(await ids(raw, 'parents')).toEqual(['p', 'r']);
      expect(await ids(raw, 'children')).toEqual(['child']);
      const status = await raw.execute({
        sql: 'SELECT status FROM parents WHERE id = ?',
        args: ['p'],
      });
      expect(status.rows[0]?.status).toBe('done');
      expect(calls.rollback).toBe(4);
      expect(calls.commit).toBe(1);
      expect(calls.batches).toBe(5);
      const logged = JSON.stringify(logs);
      expect(logged).not.toContain('UNIQUE');
      expect(logged).not.toContain('FOREIGN');
      expect(logged).not.toContain('INSERT INTO');
      expect(logged).not.toContain('solo');
      expect(logged).not.toContain('temp');
      expect(logged).not.toContain('missing');
      expect(logs.every((entry) => entry.cause === 'LibsqlError' || entry.cause === 'Error')).toBe(true);
      expect(logs.map((entry) => entry.batchSize)).toEqual([2, 2, 2]);
    });
  });

  it('runs at least 2000 statements in one local libsql batch', async () => {
    await withFile(async (raw) => {
      await raw.execute('CREATE TABLE kept (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)');
      await raw.execute({ sql: 'INSERT INTO kept (id, n) VALUES (?, ?)', args: [0, 0] });
      const calls = { commit: 0, rollback: 0, close: 0, modes: [] as string[], batches: 0, statements: 0 };
      const uow = createSqliteUnitOfWork({
        client: record(libsqlWriteClient(raw), calls),
        participants: [passthrough('captures')],
      });
      const writes = Array.from({ length: 2000 }, (_, index) =>
        work(
          'captures',
          statement('INSERT INTO kept (id, n) VALUES (?, ?)', [index + 1, index])
        )
      );

      const result = await uow.commit(writes);

      expect(result.isOk()).toBe(true);
      expect(calls.modes).toEqual(['write']);
      expect(calls.batches).toBe(1);
      expect(calls.statements).toBe(2000);
      expect(calls.commit).toBe(1);
      expect(calls.rollback).toBe(0);
      const count = await raw.execute('SELECT COUNT(*) AS n FROM kept');
      expect(Number(count.rows[0]?.n)).toBe(2001);
      expect(await raw.execute({ sql: 'SELECT n FROM kept WHERE id = ?', args: [0] })).toMatchObject({
        rows: [{ n: 0 }],
      });
    });
  });
});

const ids = async (client: Client, table: 'parents' | 'children'): Promise<unknown[]> => {
  const sql =
    table === 'parents' ? 'SELECT id FROM parents ORDER BY id' : 'SELECT id FROM children ORDER BY id';
  const result = await client.execute(sql);
  return result.rows.map((row) => row.id);
};

const record = (
  inner: WriteClient,
  calls: {
    commit: number;
    rollback: number;
    close: number;
    modes: string[];
    batches: number;
    statements: number;
  }
): WriteClient => ({
  transaction: async (mode) => {
    calls.modes.push(mode);
    const tx = await inner.transaction(mode);
    return {
      batch: async (statements) => {
        calls.batches += 1;
        calls.statements += statements.length;
        return tx.batch(statements);
      },
      commit: async () => {
        calls.commit += 1;
        await tx.commit();
      },
      rollback: async () => {
        calls.rollback += 1;
        await tx.rollback();
      },
      close: () => {
        calls.close += 1;
        return tx.close();
      },
    };
  },
});

const withFile = async (run: (client: Client) => Promise<void>): Promise<void> => {
  const dir = mkdtempSync(join(tmpdir(), 'yoink-uow-'));
  const client = createClient({ url: `file:${join(dir, 'uow.db')}` });
  try {
    await run(client);
  } finally {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }
};
