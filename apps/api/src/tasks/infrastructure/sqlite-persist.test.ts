import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../../database/test-utils.js';
import type { Database } from '../../database/types.js';
import { createSqliteTaskPersist } from './store-backed-persist.js';
import { createSqliteChangeLogStore } from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';
import { createSqliteTaskStore } from './sqlite-task-store.js';
import { planTaskChange } from '../domain/plan-task-change.js';
import type {
  TaskChangeLogIds,
  TaskUncompletedChangeLogIds,
} from '../domain/change-log-records.js';
import { UNLISTED_PILE_SUBJECT_ID } from '../../shared/change-log/domain/kinds.js';
import type { Task } from '@yoink/api-contracts';
import type { TaskCreated, TaskEvent, TaskUncompleted } from '../domain/events.js';

const now = '2025-01-15T10:00:00.000Z';
const later = '2025-01-15T11:00:00.000Z';

type Persist = ReturnType<typeof createSqliteTaskPersist>;

function persistEvent(
  persist: Persist,
  event: TaskCreated,
  current: null,
  ids?: TaskChangeLogIds
): ReturnType<Persist>;
function persistEvent(
  persist: Persist,
  event: TaskUncompleted,
  current: Task,
  ids: TaskUncompletedChangeLogIds
): ReturnType<Persist>;
function persistEvent(
  persist: Persist,
  event: Exclude<TaskEvent, TaskCreated | TaskUncompleted>,
  current: Task | null,
  ids?: TaskChangeLogIds
): ReturnType<Persist>;
function persistEvent(
  persist: Persist,
  event: TaskEvent,
  current: Task | null,
  ids: TaskChangeLogIds | TaskUncompletedChangeLogIds = { recordId: 'log-1' }
) {
  if (event.type === 'TaskCreated') {
    return persist(planTaskChange({ event, current: null, actor: { kind: 'user' as const, userId: 'user-1', via: 'session' }, ids }));
  }
  if (event.type === 'TaskUncompleted') {
    if (current === null || !('renumberRecordId' in ids)) {
      throw new Error('TaskUncompleted requires current and renumberRecordId');
    }
    return persist(
      planTaskChange({
        event,
        current,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' },
        ids: { recordId: ids.recordId, renumberRecordId: ids.renumberRecordId },
      })
    );
  }
  if (current === null) {
    throw new Error(`${event.type} requires current`);
  }
  return persist(planTaskChange({ event, current, actor: { kind: 'user' as const, userId: 'user-1', via: 'session' }, ids }));
}

describe('sqlite task persist', () => {
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

  it('rolls back the task row when the change log insert fails', async () => {
    const persist = createSqliteTaskPersist({ db });
    const created = await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      title: 'Buy milk',
      openOrder: 0,
      createdAt: now,
      occurredAt: now,
    }, null);
    expect(created.isOk()).toBe(true);

    await db.execute({
      sql: `
        CREATE TRIGGER fail_change_log BEFORE INSERT ON change_log
        BEGIN
          SELECT RAISE(ABORT, 'history failed');
        END
      `,
    });

    const store = await createSqliteTaskStore(db);
    const current = (await store.findById('task-1'))._unsafeUnwrap();
    expect(current).not.toBeNull();

    const updated = await persistEvent(persist, {
      type: 'TaskUpdated',
      id: 'task-1',
      organizationId: 'org-1',
      title: 'Should not stick',
      occurredAt: later,
    }, current, { recordId: 'log-2' });
    expect(updated.isErr()).toBe(true);

    const row = await db.execute({
      sql: `SELECT title FROM tasks WHERE id = ?`,
      args: ['task-1'],
    });
    expect(row.rows[0]?.title).toBe('Buy milk');
  });

  it('records pin as a hidden change and does not update last_changed_at', async () => {
    const persist = createSqliteTaskPersist({ db });
    await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      title: 'Buy milk',
      openOrder: 0,
      createdAt: now,
      occurredAt: now,
    }, null);

    const store = await createSqliteTaskStore(db);
    const current = (await store.findById('task-1'))._unsafeUnwrap();
    expect(current).not.toBeNull();

    const pinned = await persistEvent(persist, {
      type: 'TaskPinned',
      id: 'task-1',
      organizationId: 'org-1',
      pinnedAt: later,
      occurredAt: later,
    }, current, { recordId: 'log-pin' });
    expect(pinned.isOk()).toBe(true);

    const after = (await store.findById('task-1'))._unsafeUnwrap();
    expect(after?.pinnedAt).toBe(later);
    expect(after?.lastChangedAt).toBe(now);

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('task', 'task-1'))._unsafeUnwrap();
    expect(records.map((record) => record.kind)).toEqual(['TaskCreated', 'TaskPinned']);
    expect(records[1]?.hidden).toBe(true);
    expect(records[1]?.projectId).toBeNull();
  });

  it('keeps an old task’s createdAt and leaves lastChanged null', async () => {
    await db.execute({
      sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ['task-old', 'org-1', 'user-1', 'Old task', '2024-06-01T00:00:00.000Z'],
    });

    const store = await createSqliteTaskStore(db);
    const loaded = (await store.findById('task-old'))._unsafeUnwrap();
    expect(loaded?.createdAt).toBe('2024-06-01T00:00:00.000Z');
    expect(loaded?.createdById).toBe('user-1');
    expect(loaded?.lastChangedAt).toBeNull();
    expect(loaded?.lastChangedBy).toBeNull();
  });

  it('writes exactly one TaskDeleted record, no capture record, and soft-deletes the capture', async () => {
    await db.execute({
      sql: `INSERT INTO captures (id, organization_id, created_by_id, content, status, captured_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['cap-1', 'org-1', 'user-1', 'milk', 'processed', now],
    });

    const persist = createSqliteTaskPersist({ db });
    await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      title: 'Buy milk',
      captureId: 'cap-1',
      openOrder: 0,
      createdAt: now,
      occurredAt: now,
    }, null);

    const store = await createSqliteTaskStore(db);
    const current = (await store.findById('task-1'))._unsafeUnwrap();
    expect(current).not.toBeNull();

    const deleted = await persistEvent(persist, {
      type: 'TaskDeleted',
      id: 'task-1',
      organizationId: 'org-1',
      captureId: 'cap-1',
      deletedAt: later,
      occurredAt: later,
    }, current, { recordId: 'log-del' });
    expect(deleted.isOk()).toBe(true);

    expect((await store.findById('task-1'))._unsafeUnwrap()).toBeNull();

    const capture = await db.execute({
      sql: `SELECT deleted_at FROM captures WHERE id = ?`,
      args: ['cap-1'],
    });
    expect(capture.rows[0]?.deleted_at).toBe(later);

    const log = createSqliteChangeLogStore(db);
    const taskRecords = (await log.findBySubject('task', 'task-1'))._unsafeUnwrap();
    expect(taskRecords.filter((record) => record.kind === 'TaskDeleted')).toHaveLength(1);
    const captureRecords = (await log.findBySubject('task', 'cap-1'))._unsafeUnwrap();
    expect(captureRecords).toHaveLength(0);
    const listRecords = (await log.findBySubject('list', 'cap-1'))._unsafeUnwrap();
    expect(listRecords).toHaveLength(0);
  });

  it('rolls back delete-with-capture when history insert fails', async () => {
    await db.execute({
      sql: `INSERT INTO captures (id, organization_id, created_by_id, content, status, captured_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['cap-1', 'org-1', 'user-1', 'milk', 'processed', now],
    });

    const persist = createSqliteTaskPersist({ db });
    await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      title: 'Buy milk',
      captureId: 'cap-1',
      openOrder: 0,
      createdAt: now,
      occurredAt: now,
    }, null);

    await db.execute({
      sql: `
        CREATE TRIGGER fail_change_log BEFORE INSERT ON change_log
        WHEN NEW.kind = 'TaskDeleted'
        BEGIN
          SELECT RAISE(ABORT, 'history failed');
        END
      `,
    });

    const store = await createSqliteTaskStore(db);
    const current = (await store.findById('task-1'))._unsafeUnwrap();
    const deleted = await persistEvent(persist, {
      type: 'TaskDeleted',
      id: 'task-1',
      organizationId: 'org-1',
      captureId: 'cap-1',
      deletedAt: later,
      occurredAt: later,
    }, current, { recordId: 'log-del' });
    expect(deleted.isErr()).toBe(true);

    expect((await store.findById('task-1'))._unsafeUnwrap()?.title).toBe('Buy milk');
    const capture = await db.execute({
      sql: `SELECT deleted_at FROM captures WHERE id = ?`,
      args: ['cap-1'],
    });
    expect(capture.rows[0]?.deleted_at).toBeNull();
  });

  it('rolls back uncomplete-with-siblings when history insert fails', async () => {
    const persist = createSqliteTaskPersist({ db });
    await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-open',
      organizationId: 'org-1',
      createdById: 'user-1',
      title: 'Eggs',
      openOrder: 0,
      createdAt: now,
      occurredAt: now,
    }, null);
    await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-done',
      organizationId: 'org-1',
      createdById: 'user-1',
      title: 'Milk',
      openOrder: 1,
      createdAt: now,
      occurredAt: now,
    }, null, { recordId: 'log-c2' });

    const store = await createSqliteTaskStore(db);
    let done = (await store.findById('task-done'))._unsafeUnwrap();
    expect(done).not.toBeNull();
    await persistEvent(persist, {
      type: 'TaskCompleted',
      id: 'task-done',
      organizationId: 'org-1',
      completedAt: later,
      occurredAt: later,
    }, done, { recordId: 'log-done' });

    await db.execute({
      sql: `
        CREATE TRIGGER fail_change_log BEFORE INSERT ON change_log
        WHEN NEW.kind = 'TaskUncompleted'
        BEGIN
          SELECT RAISE(ABORT, 'history failed');
        END
      `,
    });

    done = (await store.findById('task-done'))._unsafeUnwrap();
    if (!done) {
      throw new Error('expected task-done');
    }
    const uncompleted = await persistEvent(persist, {
      type: 'TaskUncompleted',
      id: 'task-done',
      organizationId: 'org-1',
      openOrder: 1,
      siblingOrders: [{ id: 'task-open', openOrder: 0 }],
      occurredAt: '2025-01-15T12:00:00.000Z',
    }, done, { recordId: 'log-unc', renumberRecordId: 'log-ren' });
    expect(uncompleted.isErr()).toBe(true);

    const stillDone = (await store.findById('task-done'))._unsafeUnwrap();
    expect(stillDone?.completedAt).toBe(later);
    const sibling = (await store.findById('task-open'))._unsafeUnwrap();
    expect(sibling?.openOrder).toBe(0);
  });

  it('returns NOT_FOUND for the loser when two deletes race, and writes exactly one TaskDeleted', async () => {
    const persist = createSqliteTaskPersist({ db });
    await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      title: 'Buy milk',
      openOrder: 0,
      createdAt: now,
      occurredAt: now,
    }, null);

    const store = await createSqliteTaskStore(db);
    const current = (await store.findById('task-1'))._unsafeUnwrap();
    expect(current).not.toBeNull();

    const [first, second] = await Promise.all([
      persistEvent(persist, {
        type: 'TaskDeleted',
        id: 'task-1',
        organizationId: 'org-1',
        deletedAt: later,
        occurredAt: later,
      }, current, { recordId: 'log-del-a' }),
      persistEvent(persist, {
        type: 'TaskDeleted',
        id: 'task-1',
        organizationId: 'org-1',
        deletedAt: later,
        occurredAt: later,
      }, current, { recordId: 'log-del-b' }),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((result) => result.isOk())).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.isErr() && result.error.type === 'TASK_NOT_FOUND')
    ).toHaveLength(1);

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('task', 'task-1'))._unsafeUnwrap();
    expect(records.filter((record) => record.kind === 'TaskDeleted')).toHaveLength(1);
  });

  it('returns NOT_FOUND and does not renumber siblings when the uncompleted task is gone', async () => {
    const persist = createSqliteTaskPersist({ db });
    await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-open',
      organizationId: 'org-1',
      createdById: 'user-1',
      title: 'Eggs',
      openOrder: 0,
      createdAt: now,
      occurredAt: now,
    }, null);
    await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-done',
      organizationId: 'org-1',
      createdById: 'user-1',
      title: 'Milk',
      openOrder: 1,
      createdAt: now,
      occurredAt: now,
    }, null, { recordId: 'log-c2' });

    const store = await createSqliteTaskStore(db);
    let done = (await store.findById('task-done'))._unsafeUnwrap();
    expect(done).not.toBeNull();
    await persistEvent(persist, {
      type: 'TaskCompleted',
      id: 'task-done',
      organizationId: 'org-1',
      completedAt: later,
      occurredAt: later,
    }, done, { recordId: 'log-done' });

    done = (await store.findById('task-done'))._unsafeUnwrap();
    if (!done) {
      throw new Error('expected task-done');
    }
    await persistEvent(persist, {
      type: 'TaskDeleted',
      id: 'task-done',
      organizationId: 'org-1',
      deletedAt: '2025-01-15T12:00:00.000Z',
      occurredAt: '2025-01-15T12:00:00.000Z',
    }, done, { recordId: 'log-del' });

    const uncompleted = await persistEvent(persist, {
      type: 'TaskUncompleted',
      id: 'task-done',
      organizationId: 'org-1',
      openOrder: 1,
      siblingOrders: [{ id: 'task-open', openOrder: 99 }],
      occurredAt: '2025-01-15T13:00:00.000Z',
    }, done, { recordId: 'log-unc', renumberRecordId: 'log-ren' });

    expect(uncompleted.isErr() && uncompleted.error.type === 'TASK_NOT_FOUND').toBe(true);

    const sibling = (await store.findById('task-open'))._unsafeUnwrap();
    expect(sibling?.openOrder).toBe(0);

    const log = createSqliteChangeLogStore(db);
    const taskRecords = (await log.findBySubject('task', 'task-done'))._unsafeUnwrap();
    expect(taskRecords.map((record) => record.kind)).toEqual([
      'TaskCreated',
      'TaskCompleted',
      'TaskDeleted',
    ]);
    const listRecords = (
      await log.findBySubject('list', UNLISTED_PILE_SUBJECT_ID)
    )._unsafeUnwrap();
    expect(listRecords.filter((record) => record.kind === 'OpenTasksRenumbered')).toHaveLength(0);
  });

  it('returns NOT_FOUND and writes no TaskUpdated when the row is gone', async () => {
    const persist = createSqliteTaskPersist({ db });
    await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      title: 'Buy milk',
      openOrder: 0,
      createdAt: now,
      occurredAt: now,
    }, null);

    const store = await createSqliteTaskStore(db);
    const current = (await store.findById('task-1'))._unsafeUnwrap();
    expect(current).not.toBeNull();

    await persistEvent(persist, {
      type: 'TaskDeleted',
      id: 'task-1',
      organizationId: 'org-1',
      deletedAt: later,
      occurredAt: later,
    }, current, { recordId: 'log-del' });

    const updated = await persistEvent(persist, {
      type: 'TaskUpdated',
      id: 'task-1',
      organizationId: 'org-1',
      title: 'Should not stick',
      occurredAt: '2025-01-15T12:00:00.000Z',
    }, current, { recordId: 'log-upd' });

    expect(updated.isErr() && updated.error.type === 'TASK_NOT_FOUND').toBe(true);
    expect((await store.findById('task-1'))._unsafeUnwrap()).toBeNull();

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('task', 'task-1'))._unsafeUnwrap();
    expect(records.filter((record) => record.kind === 'TaskUpdated')).toHaveLength(0);
  });

  it('writes session and bot actors onto the task row and change log', async () => {
    const persist = createSqliteTaskPersist({ db });
    const session = { kind: 'user' as const, userId: 'user-1', via: 'session' };
    const created = await persist(
      planTaskChange({
        event: {
          type: 'TaskCreated',
          id: 'task-1',
          organizationId: 'org-1',
          createdById: 'user-1',
          title: 'Buy milk',
          openOrder: 0,
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: session,
        ids: { recordId: 'log-create' },
      })
    );
    expect(created.isOk()).toBe(true);

    const store = await createSqliteTaskStore(db);
    const afterCreate = (await store.findById('task-1'))._unsafeUnwrap();
    expect(afterCreate?.lastChangedBy).toBe('user-1');

    const bot = {
      kind: 'bot' as const,
      userId: 'user-lane',
      tokenId: 'tok-lane',
      name: 'Lane',
      via: 'token',
    };
    const completed = await persist(
      planTaskChange({
        event: {
          type: 'TaskCompleted',
          id: 'task-1',
          organizationId: 'org-1',
          completedAt: later,
          occurredAt: later,
        },
        current: afterCreate!,
        actor: bot,
        ids: { recordId: 'log-done' },
      })
    );
    expect(completed.isOk()).toBe(true);

    const afterComplete = (await store.findById('task-1'))._unsafeUnwrap();
    expect(afterComplete?.lastChangedBy).toBe('user-lane');
    expect(afterComplete?.completedBy).toBe('user-lane');

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('task', 'task-1'))._unsafeUnwrap();
    expect(records[0]?.actorUserId).toBe('user-1');
    expect(records[0]?.actorKind).toBe('user');
    expect(records[1]?.actorUserId).toBe('user-lane');
    expect(records[1]?.actorKind).toBe('bot');
  });
});
