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
  WriteVerb,
} from '../../kernel/unit-of-work.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
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
          if (step.sql.includes('/*throw*/')) {
            return Promise.reject({
              code: 'SQLITE_CONSTRAINT',
              rawCode: null,
              index: null,
              message: 'CHECK constraint failed: ok = 1',
            });
          }
          if (step.sql.includes('/*miss*/')) {
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

  it('maps a guarded write of zero rows to Conflict and stops', async () => {
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
    expect(calls.sql).toEqual([OK, MISS]);
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

  it('maps a thrown execute to Storage without reading driver fields', async () => {
    const { client, calls } = scripted();
    const result = await createSqliteUnitOfWork({ client, participants }).commit([
      work('captures', statement(OK)),
      work('task-management', statement(THROW)),
      work('captures', statement(AFTER)),
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
    expect(calls.sql).toEqual([OK, THROW]);
    expect(calls.commit).toBe(0);
    expect(calls.rollback).toBe(1);
    expect(calls.close).toBe(1);
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
          owner: 'task-management',
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
});

describe('libsql write transaction', () => {
  it('commits INSERT ... SELECT and leaves a hidden read unexecuted', async () => {
    await withFile(async (raw) => {
      await raw.execute('CREATE TABLE parents (id TEXT PRIMARY KEY, status TEXT NOT NULL)');
      const calls = { commit: 0, rollback: 0, close: 0, modes: [] as string[] };
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
