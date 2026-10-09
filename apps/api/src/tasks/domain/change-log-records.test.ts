import { describe, it, expect } from 'vitest';
import { parseChangeLogRecord } from '../../shared/change-log/domain/parse-record.js';
import { UNLISTED_PILE_SUBJECT_ID } from '../../shared/change-log/domain/kinds.js';
import { changeLogRecordsFromTaskEvent } from './change-log-records.js';
import type { Task } from '@yoink/api-contracts';

const current: Task = {
  id: 'task-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  title: 'Eggs',
  createdAt: '2025-01-15T10:00:00.000Z',
  listId: 'list-groceries',
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
};

describe('changeLogRecordsFromTaskEvent', () => {
  it('builds a TaskCreated v1 record with projectId null', () => {
    const records = changeLogRecordsFromTaskEvent({
      event: {
        type: 'TaskCreated',
        id: 'task-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        title: 'Buy milk',
        openOrder: 0,
        createdAt: '2025-01-15T10:00:00.000Z',
        occurredAt: '2025-01-15T10:00:00.000Z',
      },
      current: null,
      actor: null,
      ids: ['log-1', 'log-2'],
    });

    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe('TaskCreated');
    expect(records[0]?.projectId).toBeNull();
    expect(records[0]?.actorUserId).toBeNull();
    expect(records[0]?.hidden).toBe(false);
    expect(parseChangeLogRecord(records[0]!).isOk()).toBe(true);
  });

  it('emits a hidden OpenTasksRenumbered record for uncomplete siblings', () => {
    const records = changeLogRecordsFromTaskEvent({
      event: {
        type: 'TaskUncompleted',
        id: 'task-1',
        organizationId: 'org-1',
        openOrder: 1,
        siblingOrders: [{ id: 'task-a', openOrder: 0 }],
        occurredAt: '2025-01-16T10:00:00.000Z',
      },
      current,
      actor: null,
      ids: ['log-1', 'log-2'],
    });

    expect(records.map((record) => record.kind)).toEqual([
      'TaskUncompleted',
      'OpenTasksRenumbered',
    ]);
    expect(records[0]?.hidden).toBe(false);
    expect(records[1]?.hidden).toBe(true);
    expect(records[1]?.subjectType).toBe('list');
    expect(records[1]?.subjectId).toBe('list-groceries');
    expect(records[0]?.id).toBe('log-1');
    expect(records[1]?.id).toBe('log-2');
    expect(parseChangeLogRecord(records[1]!).isOk()).toBe(true);
  });

  it('uses the unlisted pile subject for renumbering off a list', () => {
    const records = changeLogRecordsFromTaskEvent({
      event: {
        type: 'TaskUncompleted',
        id: 'task-1',
        organizationId: 'org-1',
        openOrder: 0,
        siblingOrders: [{ id: 'task-a', openOrder: 1 }],
        occurredAt: '2025-01-16T10:00:00.000Z',
      },
      current: { ...current, listId: undefined },
      actor: null,
      ids: ['log-1', 'log-2'],
    });

    expect(records[1]?.subjectId).toBe(UNLISTED_PILE_SUBJECT_ID);
  });

  it('logs pin as a hidden task record', () => {
    const records = changeLogRecordsFromTaskEvent({
      event: {
        type: 'TaskPinned',
        id: 'task-1',
        organizationId: 'org-1',
        pinnedAt: '2025-01-15T11:00:00.000Z',
        occurredAt: '2025-01-15T11:00:00.000Z',
      },
      current,
      actor: null,
      ids: ['log-1'],
    });

    expect(records[0]?.kind).toBe('TaskPinned');
    expect(records[0]?.hidden).toBe(true);
  });
});
