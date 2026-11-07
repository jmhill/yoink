import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { IntegrationEvent } from '../../kernel/integration-event.js';
import type { ModuleName } from '../../kernel/module-name.js';
import type {
  GuardedStatement,
  Policy,
  SqlParticipant,
  Work,
} from '../../kernel/unit-of-work.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
  statementIsRead,
  type WriteClient,
  type WriteTransaction,
} from './sqlite-unit-of-work.js';

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

const statement = (
  sql: string,
  args: readonly unknown[] = [],
  guard = false
): GuardedStatement => ({ sql, args, guard });

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

type Calls = {
  modes: string[];
  sql: string[];
  commit: number;
  rollback: number;
  close: number;
};

const scripted = (options?: {
  readonly failOpen?: boolean;
  readonly failCommit?: boolean;
  readonly failRollback?: boolean;
  readonly failClose?: boolean;
}): { readonly client: WriteClient; readonly calls: Calls } => {
  const calls: Calls = { modes: [], sql: [], commit: 0, rollback: 0, close: 0 };
  const client: WriteClient = {
    transaction: (mode) => {
      if (options?.failOpen) {
        return Promise.reject(new Error('open failed'));
      }
      calls.modes.push(mode);
      const tx: WriteTransaction = {
        execute: (step) => {
          calls.sql.push(step.sql);
          if (step.sql === 'THROW') {
            return Promise.reject({
              code: 'SQLITE_CONSTRAINT',
              rawCode: null,
              index: null,
              message: 'CHECK constraint failed: ok = 1',
            });
          }
          if (step.sql === 'MISS') {
            return Promise.resolve({ rowsAffected: 0 });
          }
          return Promise.resolve({ rowsAffected: 1 });
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

describe('statementIsRead', () => {
  it('rejects a leading read and leaves writes alone', () => {
    expect(statementIsRead('  SELECT 1')).toBe(true);
    expect(statementIsRead('PRAGMA foreign_keys')).toBe(true);
    expect(statementIsRead('explain query plan select 1')).toBe(true);
    expect(statementIsRead('INSERT INTO parents (id) VALUES (?)')).toBe(false);
    expect(statementIsRead('selected_note')).toBe(false);
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
      work('captures', statement('INSERT')),
    ]);

    expect(result.isOk()).toBe(true);
    expect(calls.modes).toEqual(['write']);
    expect(calls.sql).toEqual(['INSERT']);
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

  it('maps a guarded write of zero rows to Conflict and stops', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement('INSERT')),
      work('task-management', statement('MISS', [], true)),
      work('captures', statement('AFTER')),
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
    expect(calls.sql).toEqual(['INSERT', 'MISS']);
    expect(calls.commit).toBe(0);
    expect(calls.rollback).toBe(1);
    expect(calls.close).toBe(1);
  });

  it('commits an unguarded write that changed no rows', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement('MISS', [], false)),
    ]);

    expect(result.isOk()).toBe(true);
    expect(calls.commit).toBe(1);
    expect(calls.rollback).toBe(0);
  });

  it('maps a thrown execute to Storage without reading driver fields', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement('INSERT')),
      work('task-management', statement('THROW')),
      work('captures', statement('AFTER')),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owner: 'task-management',
        reason: 'execute-failed',
      });
      expect(keysOf(result.error)).toEqual(['kind', 'owner', 'reason']);
    }
    expect(calls.sql).toEqual(['INSERT', 'THROW']);
    expect(calls.commit).toBe(0);
    expect(calls.rollback).toBe(1);
    expect(calls.close).toBe(1);
  });

  it('closes when rollback throws and still does not commit', async () => {
    const { client, calls } = scripted({ failRollback: true });
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement('MISS', [], true)),
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
      work('captures', statement('THROW')),
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
    }).commit([work('captures', statement('INSERT'))]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owner: 'captures',
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
      work('captures', statement('INSERT')),
    ]);

    expect(result.isOk()).toBe(true);
    expect(calls.commit).toBe(1);
    expect(calls.rollback).toBe(0);
    expect(calls.close).toBe(1);
  });

  it('does not commit when opening the transaction throws', async () => {
    const { client, calls } = scripted({ failOpen: true });
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement('INSERT')),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owner: 'captures',
        reason: 'transaction-failed',
      });
    }
    expect(calls.commit).toBe(0);
    expect(calls.rollback).toBe(0);
  });

  it('rejects a later read without opening a transaction', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement('INSERT')),
      work('task-management', statement('SELECT 1')),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owner: 'task-management',
        reason: 'read-rejected',
      });
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
        reason: 'read-rejected',
      });
    }
    expect(pragma.isErr()).toBe(true);
    if (pragma.isErr()) {
      expect(pragma.error).toEqual({
        kind: 'Storage',
        owner: 'task-management',
        reason: 'read-rejected',
      });
    }
    expect(calls.modes).toEqual([]);
  });

  it('names a missing participant and does not open a transaction', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('notes', statement('INSERT')),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: 'Storage',
        owner: 'notes',
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
      work('captures', statement('INSERT'), ['TaskDeleted']),
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
          return okAsync(work('task-management', statement('POLICY'), ['CaptureDeleted']));
        },
      },
      {
        on: 'CaptureDeleted',
        react: () => {
          seen.push('again');
          return okAsync(work('captures', statement('AGAIN')));
        },
      },
    ];
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants, policies }).commit([
      work('captures', statement('INSERT'), ['TaskDeleted']),
    ]);

    expect(result.isOk()).toBe(true);
    expect(seen).toEqual(['delete-capture']);
    expect(calls.modes).toEqual(['write']);
    expect(calls.sql).toEqual(['INSERT', 'POLICY']);
    expect(calls.commit).toBe(1);
  });
});

describe('libsql write transaction', () => {
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

      const calls = { commit: 0, rollback: 0, close: 0, modes: [] as string[] };
      const client = record(libsqlWriteClient(raw), calls);
      const uow = createSqliteUnitOfWork({
        client,
        participants: [passthrough('captures'), passthrough('notes'), passthrough('task-management')],
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
          owner: 'task-management',
          reason: 'execute-failed',
        });
        expect(keysOf(duplicate.error)).toEqual(['kind', 'owner', 'reason']);
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
          owner: 'notes',
          reason: 'execute-failed',
        });
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
      expect(calls.rollback).toBe(3);
      expect(calls.commit).toBe(1);
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
  calls: { commit: number; rollback: number; close: number; modes: string[] }
): WriteClient => ({
  transaction: async (mode) => {
    calls.modes.push(mode);
    const tx = await inner.transaction(mode);
    return {
      execute: (step) => tx.execute(step),
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
        tx.close();
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
