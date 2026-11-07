import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { err, errAsync, ok, okAsync } from 'neverthrow';
import type { IdGenerator } from '../../../kernel/id-generator.js';
import type { IntegrationEvent } from '../../../kernel/integration-event.js';
import type {
  EventSink,
  FakeParticipant,
  GuardedStatement,
  Policy,
  Work,
} from '../../../kernel/unit-of-work.js';
import { createInMemoryUnitOfWork } from '../../../platform/unit-of-work/in-memory-unit-of-work.js';
import {
  createSqliteUnitOfWork,
  libsqlWriteClient,
  type WriteClient,
  type WriteTransaction,
} from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { createHistoryEventSink } from '../application/prepare-event-sink.js';
import { EMPTY_EVENT_SINK_MAP, type EventRecordBuilder, type TimelineDraft } from '../domain/event-sink.js';
import type { ChangeLogRecord } from '../domain/record.js';
import { createFakeHistoryParticipant } from './fake-event-sink.js';
import { changeLogInsert, historySqlParticipant } from './sqlite-event-sink.js';

const ORG = 'org-1';

const event = (type: string, organizationId = ORG): IntegrationEvent => ({
  id: `${type}-event`,
  type,
  schemaVersion: 1,
  organizationId,
  occurredAt: '2026-11-07T00:00:00.000Z',
  actor: { kind: 'user', userId: 'user-1', via: 'session' },
  subject: { type: 'task', id: 'task-1', projectId: 'project-1' },
  payload: {},
});

const draft = (subjectId = 'task-1'): TimelineDraft => ({
  organizationId: ORG,
  projectId: 'project-1',
  subjectType: 'task',
  subjectId,
  kind: 'TaskCreated',
  schemaVersion: 1,
  payload: { title: 'Sample', openOrder: 0, createdById: 'user-1' },
  actorUserId: 'user-1',
  actorKind: 'user',
  occurredAt: '2026-11-07T00:00:00.000Z',
  hidden: false,
});

const sampleBuilder: EventRecordBuilder = (item) => [
  { ...draft(item.subject.id), organizationId: item.organizationId },
];

const twoBuilder: EventRecordBuilder = () => [draft('task-1'), draft('task-2')];

const ids = (): IdGenerator => {
  let n = 0;
  return {
    generate: () => {
      n += 1;
      return `record-${n}`;
    },
  };
};

const sampleSink = (builders: Record<string, EventRecordBuilder> = { SampleNoted: sampleBuilder }) =>
  createHistoryEventSink({ ids: ids(), builders });

const callerWork = (
  plan: GuardedStatement,
  types: readonly string[] = ['SampleNoted']
): Work<null> => ({
  result: null,
  events: types.map((type) => event(type)),
  step: { owner: 'captures', plan },
});

const INSERT_KEPT: GuardedStatement = {
  verb: 'insert',
  sql: 'INSERT INTO kept (id) VALUES (?)',
  args: ['kept-1'],
  guard: false,
};

const MISS_KEPT: GuardedStatement = {
  verb: 'update',
  sql: 'UPDATE kept SET id = id WHERE 0',
  args: [],
  guard: true,
};

const passthrough = {
  owner: 'captures' as const,
  compile: (plan: unknown) => [plan as GuardedStatement],
};

const schema = `
  CREATE TABLE organizations (id TEXT PRIMARY KEY);
  CREATE TABLE kept (id TEXT PRIMARY KEY);
  CREATE TABLE change_log (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('task', 'list', 'project', 'note')),
    subject_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    actor_user_id TEXT,
    actor_kind TEXT CHECK (actor_kind IS NULL OR actor_kind IN ('user', 'bot')),
    occurred_at TEXT NOT NULL,
    hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
    seq INTEGER NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
  );
  CREATE UNIQUE INDEX idx_change_log_seq ON change_log (seq);
`;

describe('history event sink on a file database', () => {
  const files: string[] = [];

  afterEach(() => {
    for (const path of files.splice(0)) {
      rmSync(path, { recursive: true, force: true });
    }
  });

  const open = async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yoink-history-sink-'));
    files.push(dir);
    const path = join(dir, 'sink.db');
    const client = createClient({ url: `file:${path}` });
    await client.executeMultiple(schema);
    await client.execute({ sql: 'INSERT INTO organizations (id) VALUES (?)', args: [ORG] });
    const read = createClient({ url: `file:${path}` });
    return { client, read };
  };

  const rows = async (read: Client) => {
    const result = await read.execute(
      'SELECT id, organization_id, subject_type, subject_id, kind, seq, payload_json FROM change_log ORDER BY seq'
    );
    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      kind: row.kind,
      seq: Number(row.seq),
      payload: row.payload_json,
    }));
  };

  const kept = async (read: Client) => {
    const result = await read.execute('SELECT id FROM kept ORDER BY id');
    return result.rows.map((row) => row.id);
  };

  it('writes the sample event and the next seq in one transaction', async () => {
    const { client, read } = await open();
    const uow = createSqliteUnitOfWork({
      client: libsqlWriteClient(client),
      participants: [passthrough, historySqlParticipant],
      sink: sampleSink({ SampleNoted: twoBuilder }),
    });

    const committed = await uow.commit([callerWork(INSERT_KEPT)]);

    expect(committed.isOk()).toBe(true);
    expect(await kept(read)).toEqual(['kept-1']);
    expect(await rows(read)).toEqual([
      {
        id: 'record-1',
        organizationId: ORG,
        subjectType: 'task',
        subjectId: 'task-1',
        kind: 'TaskCreated',
        seq: 1,
        payload: JSON.stringify({ title: 'Sample', openOrder: 0, createdById: 'user-1' }),
      },
      {
        id: 'record-2',
        organizationId: ORG,
        subjectType: 'task',
        subjectId: 'task-2',
        kind: 'TaskCreated',
        seq: 2,
        payload: JSON.stringify({ title: 'Sample', openOrder: 0, createdById: 'user-1' }),
      },
    ]);
    client.close();
    read.close();
  });

  it('rolls the change log back when an earlier guard misses', async () => {
    const { client, read } = await open();
    const uow = createSqliteUnitOfWork({
      client: libsqlWriteClient(client),
      participants: [passthrough, historySqlParticipant],
      sink: sampleSink(),
    });

    const missed = await uow.commit([callerWork(MISS_KEPT)]);

    expect(missed.isErr()).toBe(true);
    if (missed.isErr()) {
      expect(missed.error).toEqual({
        kind: 'Conflict',
        owner: 'captures',
        reason: 'guard-miss',
      });
    }
    expect(await rows(read)).toEqual([]);
    expect(await kept(read)).toEqual([]);
    client.close();
    read.close();
  });

  it('rolls the caller write back when the history insert fails', async () => {
    const { client, read } = await open();
    const uow = createSqliteUnitOfWork({
      client: libsqlWriteClient(client),
      participants: [passthrough, historySqlParticipant],
      sink: sampleSink(),
    });
    const missingOrg = callerWork(INSERT_KEPT, ['SampleNoted']);
    const work: Work<null> = {
      ...missingOrg,
      events: [event('SampleNoted', 'missing-org')],
    };

    const failed = await uow.commit([work]);

    expect(failed.isErr()).toBe(true);
    if (failed.isErr()) {
      expect(failed.error).toEqual({
        kind: 'Storage',
        owner: 'history',
        reason: 'execute-failed',
      });
    }
    expect(await kept(read)).toEqual([]);
    expect(await rows(read)).toEqual([]);
    client.close();
    read.close();
  });

  it('leaves the caller write in place when the map is empty', async () => {
    const { client, read } = await open();
    const uow = createSqliteUnitOfWork({
      client: libsqlWriteClient(client),
      participants: [passthrough, historySqlParticipant],
      sink: createHistoryEventSink({ ids: ids(), builders: EMPTY_EVENT_SINK_MAP }),
    });

    const committed = await uow.commit([callerWork(INSERT_KEPT)]);

    expect(committed.isOk()).toBe(true);
    expect(await kept(read)).toEqual(['kept-1']);
    expect(await rows(read)).toEqual([]);
    client.close();
    read.close();
  });
});

describe('history event sink in memory', () => {
  const captures = (): FakeParticipant<unknown> & { readonly applied: () => number } => {
    let applied = 0;
    return {
      owner: 'captures',
      applied: () => applied,
      snapshot: () => {
        const saved = applied;
        return () => {
          applied = saved;
        };
      },
      apply: () => {
        applied += 1;
        return ok(undefined);
      },
    };
  };

  it('stores the same records the file commit stored', async () => {
    const history = createFakeHistoryParticipant();
    const caller = captures();
    const uow = createInMemoryUnitOfWork({
      participants: [caller, history],
      sink: sampleSink({ SampleNoted: twoBuilder }),
    });

    const committed = await uow.commit([
      {
        result: null,
        events: [event('SampleNoted')],
        step: { owner: 'captures', plan: null },
      },
    ]);

    expect(committed.isOk()).toBe(true);
    expect(caller.applied()).toBe(1);
    expect(history.records().map((record) => record.id)).toEqual(['record-1', 'record-2']);
    expect(history.records().map((record) => record.subjectId)).toEqual(['task-1', 'task-2']);
  });

  it('restores history when a caller step fails', async () => {
    const history = createFakeHistoryParticipant();
    const caller: FakeParticipant<unknown> = {
      owner: 'captures',
      snapshot: () => () => undefined,
      apply: () => err({ kind: 'Conflict', owner: 'captures', reason: 'guard-miss' }),
    };
    const uow = createInMemoryUnitOfWork({
      participants: [caller, history],
      sink: sampleSink(),
    });

    const missed = await uow.commit([
      {
        result: null,
        events: [event('SampleNoted')],
        step: { owner: 'captures', plan: null },
      },
    ]);

    expect(missed.isErr()).toBe(true);
    if (missed.isErr()) {
      expect(missed.error).toEqual({
        kind: 'Conflict',
        owner: 'captures',
        reason: 'guard-miss',
      });
    }
    expect(history.records()).toEqual([]);
  });

  it('records policy events once and does not run the next policy', async () => {
    const seen: string[] = [];
    const policies: readonly Policy[] = [
      {
        on: 'SampleNoted',
        react: () => {
          seen.push('SampleNoted');
          return okAsync({
            result: null,
            events: [event('PolicyNoted')],
            step: { owner: 'notes', plan: null },
          });
        },
      },
      {
        on: 'PolicyNoted',
        react: () => {
          seen.push('PolicyNoted');
          return okAsync({
            result: null,
            events: [event('Again')],
            step: { owner: 'review', plan: null },
          });
        },
      },
    ];
    const history = createFakeHistoryParticipant();
    const notes: FakeParticipant<unknown> = {
      owner: 'notes',
      snapshot: () => () => undefined,
      apply: () => ok(undefined),
    };
    const capturesBox = captures();
    const uow = createInMemoryUnitOfWork({
      participants: [capturesBox, notes, history],
      policies,
      sink: sampleSink({
        SampleNoted: sampleBuilder,
        PolicyNoted: (item) => [draft(item.type)],
      }),
    });

    const committed = await uow.commit([
      {
        result: null,
        events: [event('SampleNoted')],
        step: { owner: 'captures', plan: null },
      },
    ]);

    expect(committed.isOk()).toBe(true);
    expect(seen).toEqual(['SampleNoted']);
    expect(history.records().map((record) => record.subjectId)).toEqual(['task-1', 'PolicyNoted']);
  });

  it('refuses before the sink writes', async () => {
    const history = createFakeHistoryParticipant();
    let prepared = 0;
    const sink: EventSink = {
      owner: 'history',
      prepare: (events) => {
        prepared += events.length;
        return null;
      },
    };
    const caller = captures();
    const uow = createInMemoryUnitOfWork({
      participants: [caller, history],
      policies: [
        {
          on: 'SampleNoted',
          react: () => errAsync({ kind: 'Refused', reason: 'not-now' }),
        },
      ],
      sink,
    });

    const refused = await uow.commit([
      {
        result: null,
        events: [event('SampleNoted')],
        step: { owner: 'captures', plan: null },
      },
    ]);

    expect(refused.isErr()).toBe(true);
    if (refused.isErr()) {
      expect(refused.error).toEqual({ kind: 'Refused', reason: 'not-now' });
    }
    expect(prepared).toBe(0);
    expect(caller.applied()).toBe(0);
    expect(history.records()).toEqual([]);
  });

  it('names history when the sink has a plan and no participant', async () => {
    const caller = captures();
    const uow = createInMemoryUnitOfWork({
      participants: [caller],
      sink: sampleSink(),
    });

    const missing = await uow.commit([
      {
        result: null,
        events: [event('SampleNoted')],
        step: { owner: 'captures', plan: null },
      },
    ]);

    expect(missing.isErr()).toBe(true);
    if (missing.isErr()) {
      expect(missing.error).toEqual({
        kind: 'Storage',
        owner: 'history',
        reason: 'no-participant',
      });
    }
    expect(caller.applied()).toBe(0);
  });

  it('rejects a plan that is not timeline records', async () => {
    const history = createFakeHistoryParticipant();
    const applied = history.apply({ not: 'records' });
    expect(applied.isErr()).toBe(true);
    if (applied.isErr()) {
      expect(applied.error).toEqual({
        kind: 'Storage',
        owner: 'history',
        reason: 'plan-rejected',
      });
    }
    expect(history.records()).toEqual([]);
  });
});

describe('history sql participant', () => {
  it('names no other module table and is not a guarded write', () => {
    const record: ChangeLogRecord = {
      id: 'record-1',
      organizationId: ORG,
      projectId: 'project-1',
      subjectType: 'task',
      subjectId: 'task-1',
      kind: 'TaskCreated',
      schemaVersion: 1,
      payload: { title: 'Sample', openOrder: 0, createdById: 'user-1' },
      actorUserId: 'user-1',
      actorKind: 'user',
      occurredAt: '2026-11-07T00:00:00.000Z',
      hidden: false,
    };
    const statement = changeLogInsert(record);
    expect(statement.verb).toBe('insert');
    expect(statement.guard).toBe(false);
    expect(statement.sql).toContain('INSERT INTO change_log');
    expect(statement.sql).toContain('FROM change_log');
    expect(statement.sql.toLowerCase()).not.toContain('begin');
    expect(statement.sql).not.toMatch(/\b(tasks|projects|lists|organizations|project_notes)\b/);
  });

  it('does not open a transaction when history is not registered', async () => {
    const calls = { opened: 0 };
    const client: WriteClient = {
      transaction: () => {
        calls.opened += 1;
        return Promise.resolve({
          execute: () => Promise.resolve({ rowsAffected: 1 }),
          commit: () => Promise.resolve(),
          rollback: () => Promise.resolve(),
          close: () => undefined,
        });
      },
    };
    const uow = createSqliteUnitOfWork({
      client,
      participants: [passthrough],
      sink: sampleSink(),
    });

    const missing = await uow.commit([callerWork(INSERT_KEPT)]);

    expect(missing.isErr()).toBe(true);
    if (missing.isErr()) {
      expect(missing.error).toEqual({
        kind: 'Storage',
        owner: 'history',
        reason: 'no-participant',
      });
    }
    expect(calls.opened).toBe(0);
  });

  it('does not open a transaction for a plan that is not records', async () => {
    const calls = { opened: 0, sql: [] as string[] };
    const client: WriteClient = {
      transaction: () => {
        calls.opened += 1;
        const tx: WriteTransaction = {
          execute: (statement) => {
            calls.sql.push(statement.sql);
            return Promise.resolve({ rowsAffected: 1 });
          },
          commit: () => Promise.resolve(),
          rollback: () => Promise.resolve(),
          close: () => undefined,
        };
        return Promise.resolve(tx);
      },
    };
    const uow = createSqliteUnitOfWork({
      client,
      participants: [historySqlParticipant],
      sink: {
        owner: 'history',
        prepare: () => ({ not: 'records' }),
      },
    });

    const failed = await uow.commit([]);

    expect(failed.isErr()).toBe(true);
    if (failed.isErr()) {
      expect(failed.error).toEqual({
        kind: 'Storage',
        owner: 'history',
        reason: 'read-rejected',
      });
    }
    expect(calls.opened).toBe(0);
    expect(calls.sql).toEqual([]);
  });
});
