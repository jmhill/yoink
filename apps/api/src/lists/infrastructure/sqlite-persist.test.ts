import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../../database/test-utils.js';
import type { Database } from '../../database/types.js';
import { createSqliteListPersist } from './store-backed-persist.js';
import { createSqliteChangeLogStore } from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';
import { planListChange, type ListChangePlanInput } from '../domain/plan-list-change.js';
import type { ListChangeLogIds } from '../domain/change-log-records.js';
import type { ListEvent } from '../domain/events.js';
import { createSqliteTaskPersist } from '../../tasks/infrastructure/store-backed-persist.js';
import { planTaskChange } from '../../tasks/domain/plan-task-change.js';
import {
  clearCompletedListIdQuery,
  setOpenOrderQueries,
} from '../../tasks/infrastructure/task-row-statements.js';
import { createSqliteListStore } from './sqlite-list-store.js';

const now = '2025-01-15T10:00:00.000Z';
const later = '2025-01-15T11:00:00.000Z';

const listPersistOf = (db: Database) =>
  createSqliteListPersist({
    db,
    taskSql: {
      clearCompletedListId: clearCompletedListIdQuery,
      setOpenOrders: setOpenOrderQueries,
    },
  });

const persistList = (
  persist: ReturnType<typeof createSqliteListPersist>,
  event: Exclude<ListEvent, { type: 'NamedListRenamed' }>,
  ids: ListChangeLogIds = { recordId: 'log-1' }
) =>
  persist(
    planListChange({ event, current: null, actor: { kind: 'user' as const, userId: 'user-1', via: 'session' }, ids } as ListChangePlanInput)
  );

describe('sqlite list persist', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', now],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'owner@example.com', now],
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('writes exactly one NamedListCreated record that is not hidden', async () => {
    const persist = listPersistOf(db);
    const result = await persistList(persist, {
      type: 'NamedListCreated',
      id: 'list-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      name: 'Groceries',
      createdAt: now,
      occurredAt: now,
    });
    expect(result.isOk()).toBe(true);

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('list', 'list-1'))._unsafeUnwrap();
    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe('NamedListCreated');
    expect(records[0]?.hidden).toBe(false);
  });

  it('writes exactly one NamedListRenamed record that is not hidden', async () => {
    const persist = listPersistOf(db);
    await persistList(persist, {
      type: 'NamedListCreated',
      id: 'list-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      name: 'Groceries',
      createdAt: now,
      occurredAt: now,
    });
    const listStore = await createSqliteListStore(db);
    const current = (await listStore.findById('list-1'))._unsafeUnwrap();
    expect(current).not.toBeNull();
    if (!current) {
      throw new Error('expected list');
    }
    const renamed = await persist(
      planListChange({
        event: {
          type: 'NamedListRenamed',
          id: 'list-1',
          organizationId: 'org-1',
          name: 'Shopping',
          occurredAt: later,
        },
        current,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' },
        ids: { recordId: 'log-rename' },
      })
    );
    expect(renamed.isOk()).toBe(true);

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('list', 'list-1'))._unsafeUnwrap();
    const rename = records.filter((record) => record.kind === 'NamedListRenamed');
    expect(rename).toHaveLength(1);
    expect(rename[0]?.hidden).toBe(false);
  });

  it('writes exactly one NamedListDeleted record that is not hidden', async () => {
    const persist = listPersistOf(db);
    await persistList(persist, {
      type: 'NamedListCreated',
      id: 'list-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      name: 'Groceries',
      createdAt: now,
      occurredAt: now,
    });
    const deleted = await persistList(persist, {
      type: 'NamedListDeleted',
      id: 'list-1',
      organizationId: 'org-1',
      occurredAt: later,
    }, { recordId: 'log-del' });
    expect(deleted.isOk()).toBe(true);

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('list', 'list-1'))._unsafeUnwrap();
    const gone = records.filter((record) => record.kind === 'NamedListDeleted');
    expect(gone).toHaveLength(1);
    expect(gone[0]?.hidden).toBe(false);
  });

  it('writes exactly one hidden OpenTasksReordered record', async () => {
    const persist = listPersistOf(db);
    await persistList(persist, {
      type: 'NamedListCreated',
      id: 'list-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      name: 'Groceries',
      createdAt: now,
      occurredAt: now,
    });

    const taskPersist = createSqliteTaskPersist({ db });
    await taskPersist(
      planTaskChange({
        event: {
          type: 'TaskCreated',
          id: 'task-a',
          organizationId: 'org-1',
          createdById: 'user-1',
          title: 'Milk',
          listId: 'list-1',
          openOrder: 0,
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' },
        ids: { recordId: 't-a' },
      })
    );
    await taskPersist(
      planTaskChange({
        event: {
          type: 'TaskCreated',
          id: 'task-b',
          organizationId: 'org-1',
          createdById: 'user-1',
          title: 'Eggs',
          listId: 'list-1',
          openOrder: 1,
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' },
        ids: { recordId: 't-b' },
      })
    );

    const reordered = await persistList(persist, {
      type: 'OpenTasksReordered',
      listId: 'list-1',
      organizationId: 'org-1',
      orders: [
        { id: 'task-b', openOrder: 0 },
        { id: 'task-a', openOrder: 1 },
      ],
      occurredAt: later,
    }, { recordId: 'log-reorder' });
    expect(reordered.isOk()).toBe(true);

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('list', 'list-1'))._unsafeUnwrap();
    const reorder = records.filter((record) => record.kind === 'OpenTasksReordered');
    expect(reorder).toHaveLength(1);
    expect(reorder[0]?.hidden).toBe(true);
  });

  it('records a bot actor on list create, rename, and delete', async () => {
    const persist = listPersistOf(db);
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-lane', 'lane@yoink.invalid', now],
    });
    const bot = {
      kind: 'bot' as const,
      userId: 'user-lane',
      tokenId: 'tok-lane',
      name: 'Lane',
      via: 'token',
    };

    const created = await persist(
      planListChange({
        event: {
          type: 'NamedListCreated',
          id: 'list-1',
          organizationId: 'org-1',
          createdById: 'user-lane',
          name: 'Groceries',
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: bot,
        ids: { recordId: 'log-create' },
      })
    );
    expect(created.isOk()).toBe(true);

    const listStore = await createSqliteListStore(db);
    const current = (await listStore.findById('list-1'))._unsafeUnwrap();
    expect(current).not.toBeNull();
    if (!current) {
      throw new Error('expected list');
    }

    const renamed = await persist(
      planListChange({
        event: {
          type: 'NamedListRenamed',
          id: 'list-1',
          organizationId: 'org-1',
          name: 'Shopping',
          occurredAt: later,
        },
        current,
        actor: bot,
        ids: { recordId: 'log-rename' },
      })
    );
    expect(renamed.isOk()).toBe(true);

    const deleted = await persist(
      planListChange({
        event: {
          type: 'NamedListDeleted',
          id: 'list-1',
          organizationId: 'org-1',
          occurredAt: '2025-01-15T12:00:00.000Z',
        },
        current,
        actor: bot,
        ids: { recordId: 'log-del' },
      })
    );
    expect(deleted.isOk()).toBe(true);

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('list', 'list-1'))._unsafeUnwrap();
    expect(records).toHaveLength(3);
    expect(records.map((record) => record.kind)).toEqual([
      'NamedListCreated',
      'NamedListRenamed',
      'NamedListDeleted',
    ]);
    for (const record of records) {
      expect(record.actorKind).toBe('bot');
      expect(record.actorUserId).toBe('user-lane');
    }
  });

  it('rolls back list delete when history insert fails', async () => {
    const persist = listPersistOf(db);
    await persistList(persist, {
      type: 'NamedListCreated',
      id: 'list-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      name: 'Groceries',
      createdAt: now,
      occurredAt: now,
    });

    await db.execute({
      sql: `
        CREATE TRIGGER fail_change_log BEFORE INSERT ON change_log
        WHEN NEW.kind = 'NamedListDeleted'
        BEGIN
          SELECT RAISE(ABORT, 'history failed');
        END
      `,
    });

    const deleted = await persistList(persist, {
      type: 'NamedListDeleted',
      id: 'list-1',
      organizationId: 'org-1',
      occurredAt: later,
    }, { recordId: 'log-del' });
    expect(deleted.isErr()).toBe(true);

    const listStore = await createSqliteListStore(db);
    expect((await listStore.findById('list-1'))._unsafeUnwrap()?.name).toBe('Groceries');
  });
});
