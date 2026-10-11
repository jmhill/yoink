import { describe, it, expect } from 'vitest';
import { CHANGE_LOG_KINDS, hiddenFor, type ChangeLogKind } from './kinds.js';
import type { ChangeLogRecord } from './record.js';
import {
  UNKNOWN_ACTOR_NAME,
  toTimelineEntry,
  type TimelineLookups,
} from './to-timeline-entry.js';

const envelope = {
  id: 'log-1',
  organizationId: 'org-1',
  projectId: 'project-1',
  subjectId: 'subject-1',
  actorUserId: 'user-1',
  actorKind: 'user' as const,
  occurredAt: '2026-10-11T15:04:00.000Z',
};

const lookups: TimelineLookups = {
  subjectOf: (type, id) => {
    if (type === 'task' && id === 'subject-1') {
      return { title: 'Call Trident', deleted: false };
    }
    if (type === 'task' && id === 'deleted-1') {
      return { title: 'Old title', deleted: true };
    }
    if (type === 'project') {
      return { title: 'Kitchen renovation', deleted: false };
    }
    return { title: null, deleted: false };
  },
  taskTitleOf: (id) => {
    if (id === 'task-1') return 'Call Trident';
    if (id === 'task-prev') return 'Order lumber';
    return null;
  },
  actorNameOf: (userId) => (userId ? 'Lane' : UNKNOWN_ACTOR_NAME),
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
        payload: { title: 'Call Trident', openOrder: 0, createdById: 'user-1' },
      };
    case 'TaskUpdated':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskUpdated'),
        payload: { title: 'Call Trident again' },
      };
    case 'TaskCompleted':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskCompleted'),
        payload: { completedAt: '2026-10-11T15:04:00.000Z' },
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
        subjectId: 'deleted-1',
        kind,
        hidden: hiddenFor('TaskDeleted'),
        payload: {},
      };
    case 'TaskPinned':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskPinned'),
        payload: { pinnedAt: '2026-10-11T15:04:00.000Z' },
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
        kind,
        hidden: hiddenFor('ProjectCreated'),
        payload: { name: 'Kitchen renovation', status: 'active', createdById: 'user-1' },
      };
    case 'ProjectUpdated':
      return {
        ...base,
        subjectType: 'project',
        kind,
        hidden: hiddenFor('ProjectUpdated'),
        payload: { name: 'Kitchen' },
      };
    case 'ProjectStatusChanged':
      return {
        ...base,
        subjectType: 'project',
        kind,
        hidden: hiddenFor('ProjectStatusChanged'),
        payload: { from: 'active', to: 'waiting', waitingOn: 'Mike', waitingSince: null },
      };
    case 'ProjectWaitingChanged':
      return {
        ...base,
        subjectType: 'project',
        kind,
        hidden: hiddenFor('ProjectWaitingChanged'),
        payload: { waitingOn: 'Contractor', waitingSince: '2026-10-01' },
      };
    case 'ProjectNextActionSet':
      return {
        ...base,
        subjectType: 'project',
        kind,
        hidden: hiddenFor('ProjectNextActionSet'),
        payload: { taskId: 'task-1', previousTaskId: 'task-prev' },
      };
    case 'ProjectNextActionCleared':
      return {
        ...base,
        subjectType: 'project',
        kind,
        hidden: hiddenFor('ProjectNextActionCleared'),
        payload: { taskId: 'task-1', reason: 'completed' },
      };
    case 'TaskAddedToProject':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskAddedToProject'),
        payload: { projectId: 'project-1' },
      };
    case 'TaskRemovedFromProject':
      return {
        ...base,
        subjectType: 'task',
        kind,
        hidden: hiddenFor('TaskRemovedFromProject'),
        payload: { projectId: 'project-1' },
      };
    case 'ProjectImported':
      return {
        ...base,
        subjectType: 'project',
        kind,
        hidden: hiddenFor('ProjectImported'),
        payload: { taskCount: 2 },
      };
  }
};

describe('toTimelineEntry', () => {
  it.each(CHANGE_LOG_KINDS)('is exhaustive for %s', (kind) => {
    const mapped = toTimelineEntry(recordForKind(kind), lookups);
    if (
      kind === 'TaskPinned' ||
      kind === 'TaskUnpinned' ||
      kind === 'OpenTasksReordered' ||
      kind === 'OpenTasksRenumbered' ||
      kind === 'NamedListCreated' ||
      kind === 'NamedListRenamed' ||
      kind === 'NamedListDeleted'
    ) {
      expect(mapped).toBeNull();
      return;
    }
    expect(mapped).not.toBeNull();
    expect(mapped?.kind).toBe(kind);
    expect(mapped?.details.kind).toBe(kind);
    expect(mapped?.actor.name).toBe('Lane');
  });

  it('returns null for a TaskUpdated that only changes projectId', () => {
    const record = recordForKind('TaskUpdated');
    if (record.kind !== 'TaskUpdated') {
      throw new Error('expected TaskUpdated');
    }
    const mapped = toTimelineEntry(
      { ...record, payload: { projectId: 'project-2' } },
      lookups
    );
    expect(mapped).toBeNull();
  });

  it('returns null for a TaskUpdated that only changes projectId and openOrder', () => {
    const record = recordForKind('TaskUpdated');
    if (record.kind !== 'TaskUpdated') {
      throw new Error('expected TaskUpdated');
    }
    const mapped = toTimelineEntry(
      { ...record, payload: { projectId: 'project-2', openOrder: 3 } },
      lookups
    );
    expect(mapped).toBeNull();
  });

  it('keeps only the non-project fields on a mixed TaskUpdated', () => {
    const record = recordForKind('TaskUpdated');
    if (record.kind !== 'TaskUpdated') {
      throw new Error('expected TaskUpdated');
    }
    const mapped = toTimelineEntry(
      {
        ...record,
        payload: { projectId: 'project-2', title: 'New title', dueDate: null, openOrder: 2 },
      },
      lookups
    );
    expect(mapped?.details).toEqual({
      kind: 'TaskUpdated',
      title: 'New title',
      dueDate: null,
    });
  });

  it('marks a deleted task subject', () => {
    const mapped = toTimelineEntry(recordForKind('TaskDeleted'), lookups);
    expect(mapped?.subject).toEqual({
      type: 'task',
      id: 'deleted-1',
      title: 'Old title',
      deleted: true,
    });
  });

  it('resolves a null actor as Unknown', () => {
    const mapped = toTimelineEntry(
      { ...recordForKind('ProjectCreated'), actorUserId: null, actorKind: null },
      lookups
    );
    expect(mapped?.actor).toEqual({
      userId: null,
      kind: null,
      name: UNKNOWN_ACTOR_NAME,
    });
  });

  it('copies the destination name from the event payload', () => {
    const record = recordForKind('TaskRemovedFromProject');
    if (record.kind !== 'TaskRemovedFromProject') {
      throw new Error('expected TaskRemovedFromProject');
    }
    const mapped = toTimelineEntry(
      {
        ...record,
        payload: {
          projectId: 'project-1',
          toProjectId: 'project-other',
          toProjectName: 'Other',
        },
      },
      lookups
    );
    expect(mapped?.details).toEqual({
      kind: 'TaskRemovedFromProject',
      projectId: 'project-1',
      toProjectName: 'Other',
    });
  });

  it('falls back to a null destination name for an old move payload', () => {
    const record = recordForKind('TaskRemovedFromProject');
    if (record.kind !== 'TaskRemovedFromProject') {
      throw new Error('expected TaskRemovedFromProject');
    }
    const mapped = toTimelineEntry(
      { ...record, payload: { projectId: 'project-1', toProjectId: 'project-other' } },
      lookups
    );
    expect(mapped?.details).toEqual({
      kind: 'TaskRemovedFromProject',
      projectId: 'project-1',
      toProjectName: null,
    });
  });

  it('fills next-action titles from lookups', () => {
    const set = toTimelineEntry(recordForKind('ProjectNextActionSet'), lookups);
    expect(set?.details).toEqual({
      kind: 'ProjectNextActionSet',
      taskId: 'task-1',
      taskTitle: 'Call Trident',
      previousTaskId: 'task-prev',
      previousTaskTitle: 'Order lumber',
    });
    const cleared = toTimelineEntry(recordForKind('ProjectNextActionCleared'), lookups);
    expect(cleared?.details).toEqual({
      kind: 'ProjectNextActionCleared',
      taskId: 'task-1',
      taskTitle: 'Call Trident',
      reason: 'completed',
    });
  });
});
