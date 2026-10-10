import { describe, it, expect } from 'vitest';
import { parseChangeLogRecord } from './parse-record.js';
import { CHANGE_LOG_KINDS, hiddenFor, type ChangeLogKind } from './kinds.js';
import { changeLogRecordSchema, type ChangeLogRecord } from './record.js';

const envelope = {
  id: 'log-1',
  organizationId: 'org-1',
  projectId: null,
  subjectId: 'subject-1',
  actorUserId: null,
  actorKind: null,
  occurredAt: '2025-01-15T10:00:00.000Z',
};

const recordForKind = (kind: ChangeLogKind): ChangeLogRecord => {
  const base = {
    ...envelope,
    schemaVersion: 1 as const,
  };

  switch (kind) {
    case 'TaskCreated':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskCreated'),
        payload: { title: 'Buy milk', openOrder: 0, createdById: 'user-1' },
      };
    case 'TaskUpdated':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskUpdated'),
        payload: { title: 'Oat milk' },
      };
    case 'TaskCompleted':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskCompleted'),
        payload: { completedAt: '2025-01-16T10:00:00.000Z' },
      };
    case 'TaskUncompleted':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskUncompleted'),
        payload: { openOrder: 1 },
      };
    case 'TaskDeleted':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskDeleted'),
        payload: { captureId: 'cap-1' },
      };
    case 'TaskPinned':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskPinned'),
        payload: { pinnedAt: '2025-01-15T11:00:00.000Z' },
      };
    case 'TaskUnpinned':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskUnpinned'),
        payload: {},
      };
    case 'OpenTasksReordered':
      return {
        ...base,
        subjectType: 'list',
        kind,
        hidden: hiddenFor('OpenTasksReordered'),
        payload: { listId: 'list-1', orders: [{ id: 'task-1', openOrder: 0 }] },
      };
    case 'OpenTasksRenumbered':
      return {
        ...base,
        subjectType: 'list',
        kind,
        hidden: hiddenFor('OpenTasksRenumbered'),
        payload: { listId: null, orders: [{ id: 'task-1', openOrder: 0 }] },
      };
    case 'NamedListCreated':
      return {
        ...base,
        subjectType: 'list',
        kind,
        hidden: hiddenFor('NamedListCreated'),
        payload: { name: 'Groceries', createdById: 'user-1' },
      };
    case 'NamedListRenamed':
      return {
        ...base,
        subjectType: 'list',
        kind,
        hidden: hiddenFor('NamedListRenamed'),
        payload: { name: 'Shopping' },
      };
    case 'NamedListDeleted':
      return {
        ...base,
        subjectType: 'list',
        kind,
        hidden: hiddenFor('NamedListDeleted'),
        payload: {},
      };
    case 'ProjectCreated':
      return {
        ...base,
        subjectType: 'project',
        projectId: 'subject-1',
        kind,
        hidden: hiddenFor('ProjectCreated'),
        payload: { name: 'Garden', status: 'active', createdById: 'user-1' },
      };
    case 'ProjectUpdated':
      return {
        ...base,
        subjectType: 'project',
        projectId: 'subject-1',
        kind,
        hidden: hiddenFor('ProjectUpdated'),
        payload: { name: 'Backyard', objective: 'Plant tomatoes' },
      };
    case 'TaskAddedToProject':
      return {
        ...base,
        subjectType: 'task',
        projectId: 'project-1',
        kind,
        hidden: hiddenFor('TaskAddedToProject'),
        payload: { projectId: 'project-1' },
      };
    case 'TaskRemovedFromProject':
      return {
        ...base,
        subjectType: 'task',
        projectId: 'project-1',
        kind,
        hidden: hiddenFor('TaskRemovedFromProject'),
        payload: { projectId: 'project-1' },
      };
  }
};

describe('parseChangeLogRecord', () => {
  it.each(CHANGE_LOG_KINDS)('round-trips a %s v1 record', (kind) => {
    const record = recordForKind(kind);
    const parsed = parseChangeLogRecord(record);
    expect(parsed.isOk()).toBe(true);
    if (parsed.isOk()) {
      expect(parsed.value).toEqual(record);
      expect(changeLogRecordSchema.parse(parsed.value)).toEqual(record);
    }
  });

  it('rejects an unknown schema version', () => {
    const result = parseChangeLogRecord({
      ...recordForKind('TaskCreated'),
      schemaVersion: 99,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CHANGE_LOG_PARSE_ERROR');
    }
  });

  it('rejects a payload that does not match the kind schema', () => {
    const result = parseChangeLogRecord({
      ...recordForKind('TaskCreated'),
      payload: { openOrder: 0 },
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects a missing projectId key — null is required so project stories can fill it in', () => {
    const { projectId: _projectId, ...without } = recordForKind('TaskCreated');
    const result = parseChangeLogRecord(without);
    expect(result.isErr()).toBe(true);
  });

  it('rejects hidden=true on a visible kind', () => {
    const result = parseChangeLogRecord({
      ...recordForKind('TaskCreated'),
      hidden: true,
    });
    expect(result.isErr()).toBe(true);
  });
});
