import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../../database/test-utils.js';
import type { Database } from '../../database/types.js';
import { createSqliteTaskPersist } from './store-backed-persist.js';
import { createSqliteChangeLogStore } from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';
import { createSqliteTaskStore } from './sqlite-task-store.js';
import { createFakeClock } from '@yoink/infrastructure';

const now = '2025-01-15T10:00:00.000Z';

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
    const persist = createSqliteTaskPersist({
      db,
      nextId: () => 'log-1',
    });
    const created = await persist({
      current: null,
      actor: null,
      now,
      event: {
        type: 'TaskCreated',
        id: 'task-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        title: 'Buy milk',
        openOrder: 0,
        createdAt: now,
      },
    });
    expect(created.isOk()).toBe(true);

    await db.execute({
      sql: `
        CREATE TRIGGER fail_change_log BEFORE INSERT ON change_log
        BEGIN
          SELECT RAISE(ABORT, 'history failed');
        END
      `,
    });

    const updated = await persist({
      current: {
        id: 'task-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        title: 'Buy milk',
        createdAt: now,
        openOrder: 0,
      },
      actor: null,
      now: '2025-01-15T11:00:00.000Z',
      event: {
        type: 'TaskUpdated',
        id: 'task-1',
        organizationId: 'org-1',
        title: 'Should not stick',
      },
    });
    expect(updated.isErr()).toBe(true);

    const row = await db.execute({
      sql: `SELECT title FROM tasks WHERE id = ?`,
      args: ['task-1'],
    });
    expect(row.rows[0]?.title).toBe('Buy milk');
  });

  it('records pin as a hidden change and does not update last_changed_at', async () => {
    let n = 0;
    const persist = createSqliteTaskPersist({ db, nextId: () => `log-pin-${++n}` });
    await persist({
      current: null,
      actor: null,
      now,
      event: {
        type: 'TaskCreated',
        id: 'task-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        title: 'Buy milk',
        openOrder: 0,
        createdAt: now,
      },
    });

    const store = await createSqliteTaskStore(db, createFakeClock(new Date(now)));
    const current = (await store.findById('task-1'))._unsafeUnwrap();
    expect(current).not.toBeNull();

    const pinned = await persist({
      current,
      actor: null,
      now: '2025-01-15T11:00:00.000Z',
      event: {
        type: 'TaskPinned',
        id: 'task-1',
        organizationId: 'org-1',
        pinnedAt: '2025-01-15T11:00:00.000Z',
      },
    });
    expect(pinned.isOk()).toBe(true);

    const after = (await store.findById('task-1'))._unsafeUnwrap();
    expect(after?.pinnedAt).toBe('2025-01-15T11:00:00.000Z');
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

    const store = await createSqliteTaskStore(db, createFakeClock(new Date(now)));
    const loaded = (await store.findById('task-old'))._unsafeUnwrap();
    expect(loaded?.createdAt).toBe('2024-06-01T00:00:00.000Z');
    expect(loaded?.createdById).toBe('user-1');
    expect(loaded?.lastChangedAt).toBeNull();
    expect(loaded?.lastChangedBy).toBeNull();
  });
});
