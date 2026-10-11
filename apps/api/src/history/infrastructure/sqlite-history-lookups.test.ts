import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../../database/test-utils.js';
import type { Database } from '../../database/types.js';
import { UNKNOWN_ACTOR_NAME } from '../../shared/change-log/domain/to-timeline-entry.js';
import { createSqliteTimelineLookups } from './sqlite-history-lookups.js';

const now = '2026-10-11T15:00:00.000Z';

describe('sqlite timeline lookups', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', now],
    });
    await db.execute({
      sql: `INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)`,
      args: ['user-named', 'Lane', 'lane@example.com', now],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-email', 'owner@example.com', now],
    });
    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-email', 'Kitchen renovation', 'active', now],
    });
    await db.execute({
      sql: `INSERT INTO tasks (
              id, organization_id, created_by_id, title, project_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['task-open', 'org-1', 'user-email', 'Call Trident', 'project-1', now],
    });
    await db.execute({
      sql: `INSERT INTO tasks (
              id, organization_id, created_by_id, title, project_id, created_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'task-deleted',
        'org-1',
        'user-email',
        'Old invoice',
        'project-1',
        now,
        '2026-10-11T16:00:00.000Z',
      ],
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('loads tasks (including deleted), users, and projects in one batch', async () => {
    let batchCalls = 0;
    const originalBatch = db.batch.bind(db);
    const wrapped: Database = {
      execute: db.execute.bind(db),
      close: db.close.bind(db),
      batch: async (queries, mode) => {
        batchCalls += 1;
        return originalBatch(queries, mode);
      },
    };

    const load = createSqliteTimelineLookups(wrapped);
    const lookups = await load({
      taskIds: ['task-open', 'task-deleted'],
      userIds: ['user-named', 'user-email'],
      projectIds: ['project-1'],
    });

    expect(lookups.isOk()).toBe(true);
    expect(batchCalls).toBe(1);
    if (lookups.isOk()) {
      expect(lookups.value.subjectOf('task', 'task-open')).toEqual({
        title: 'Call Trident',
        deleted: false,
      });
      expect(lookups.value.subjectOf('task', 'task-deleted')).toEqual({
        title: 'Old invoice',
        deleted: true,
      });
      expect(lookups.value.taskTitleOf('task-open')).toBe('Call Trident');
      expect(lookups.value.subjectOf('project', 'project-1')).toEqual({
        title: 'Kitchen renovation',
        deleted: false,
      });
      expect(lookups.value.actorNameOf('user-named')).toBe('Lane');
      expect(lookups.value.actorNameOf('user-email')).toBe('owner@example.com');
      expect(lookups.value.actorNameOf(null)).toBe(UNKNOWN_ACTOR_NAME);
      expect(lookups.value.actorNameOf('missing')).toBe(UNKNOWN_ACTOR_NAME);
    }
  });
});
