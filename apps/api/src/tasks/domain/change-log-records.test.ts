import { describe, it, expect } from 'vitest';
import { parseChangeLogRecord } from '../../shared/change-log/domain/parse-record.js';
import { UNLISTED_PILE_SUBJECT_ID } from '../../shared/change-log/domain/kinds.js';
import {
  changeLogIdsForTaskUpdated,
  changeLogRecordsFromTaskEvent,
  projectMembershipChange,
} from './change-log-records.js';
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
      actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      ids: { recordId: 'log-1' },
    });

    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe('TaskCreated');
    expect(records[0]?.projectId).toBeNull();
    expect(records[0]?.actorUserId).toBe('user-1');
    expect(records[0]?.actorKind).toBe('user');
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
      actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      ids: { recordId: 'log-1', renumberRecordId: 'log-2' },
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
      actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      ids: { recordId: 'log-1', renumberRecordId: 'log-2' },
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
      actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      ids: { recordId: 'log-1' },
    });

    expect(records[0]?.kind).toBe('TaskPinned');
    expect(records[0]?.hidden).toBe(true);
  });

  it('attributes a session actor as user kind', () => {
    const records = changeLogRecordsFromTaskEvent({
      event: {
        type: 'TaskUpdated',
        id: 'task-1',
        organizationId: 'org-1',
        title: 'Oat milk',
        occurredAt: '2025-01-15T11:00:00.000Z',
      },
      current,
      actor: { kind: 'user' as const, userId: 'user-justin', via: 'session' as const },
      ids: {
        recordId: 'log-upd',
        membership: { type: 'unchanged' },
      },
    });

    expect(records[0]?.actorUserId).toBe('user-justin');
    expect(records[0]?.actorKind).toBe('user');
  });

  it('attributes a bot actor as bot kind', () => {
    const records = changeLogRecordsFromTaskEvent({
      event: {
        type: 'TaskCompleted',
        id: 'task-1',
        organizationId: 'org-1',
        completedAt: '2025-01-15T12:00:00.000Z',
        occurredAt: '2025-01-15T12:00:00.000Z',
      },
      current,
      actor: { kind: 'bot', userId: 'user-lane', tokenId: 'tok-lane', name: 'Lane', via: 'token' as const },
      ids: { recordId: 'log-done' },
    });

    expect(records[0]?.actorUserId).toBe('user-lane');
    expect(records[0]?.actorKind).toBe('bot');
  });

  it('writes TaskCreated with projectId and no extra Added record', () => {
    const records = changeLogRecordsFromTaskEvent({
      event: {
        type: 'TaskCreated',
        id: 'task-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        title: 'Buy soil',
        projectId: 'project-garden',
        openOrder: 0,
        createdAt: '2025-01-15T10:00:00.000Z',
        occurredAt: '2025-01-15T10:00:00.000Z',
      },
      current: null,
      actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      ids: { recordId: 'log-1' },
    });

    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe('TaskCreated');
    expect(records[0]?.projectId).toBe('project-garden');
    expect(records[0]?.kind === 'TaskCreated' && records[0].payload.projectId).toBe(
      'project-garden'
    );
    expect(parseChangeLogRecord(records[0]!).isOk()).toBe(true);
  });

  it('writes removed(A) + added(B) when moving A to B from the same ids decision', () => {
    const inGarden: Task = { ...current, projectId: 'project-garden' };
    const event = {
      type: 'TaskUpdated' as const,
      id: 'task-1',
      organizationId: 'org-1',
      projectId: 'project-cabin',
      occurredAt: '2025-01-15T11:00:00.000Z',
    };
    const queued = ['log-upd', 'log-rm', 'log-add'];
    const ids = changeLogIdsForTaskUpdated(event, inGarden, () => queued.shift() ?? 'missing');
    expect(ids.membership).toEqual({
      type: 'moved',
      removedFromProjectRecordId: 'log-rm',
      addedToProjectRecordId: 'log-add',
      fromProjectId: 'project-garden',
      toProjectId: 'project-cabin',
    });
    const records = changeLogRecordsFromTaskEvent({
      event,
      current: inGarden,
      actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      ids,
    });

    expect(records.map((record) => record.kind)).toEqual([
      'TaskUpdated',
      'TaskRemovedFromProject',
      'TaskAddedToProject',
    ]);
    expect(records[1]?.projectId).toBe('project-garden');
    expect(records[2]?.projectId).toBe('project-cabin');
    expect(records[0]?.projectId).toBe('project-cabin');
    expect(parseChangeLogRecord(records[1]!).isOk()).toBe(true);
    expect(parseChangeLogRecord(records[2]!).isOk()).toBe(true);
  });

  it('always writes Added when joining a project — ids come from the membership change', () => {
    const event = {
      type: 'TaskUpdated' as const,
      id: 'task-1',
      organizationId: 'org-1',
      projectId: 'project-garden',
      occurredAt: '2025-01-15T11:00:00.000Z',
    };
    expect(projectMembershipChange(event, current)).toEqual({
      type: 'added',
      projectId: 'project-garden',
    });
    const queued = ['log-upd', 'log-add'];
    const records = changeLogRecordsFromTaskEvent({
      event,
      current,
      actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      ids: changeLogIdsForTaskUpdated(event, current, () => queued.shift() ?? 'missing'),
    });
    expect(records.map((record) => record.kind)).toEqual([
      'TaskUpdated',
      'TaskAddedToProject',
    ]);
    expect(records[1]?.id).toBe('log-add');
  });

  it('always writes Removed when leaving a project — ids come from the membership change', () => {
    const inGarden: Task = { ...current, projectId: 'project-garden' };
    const event = {
      type: 'TaskUpdated' as const,
      id: 'task-1',
      organizationId: 'org-1',
      projectId: null,
      occurredAt: '2025-01-15T11:00:00.000Z',
    };
    expect(projectMembershipChange(event, inGarden)).toEqual({
      type: 'removed',
      projectId: 'project-garden',
    });
    const queued = ['log-upd', 'log-rm'];
    const records = changeLogRecordsFromTaskEvent({
      event,
      current: inGarden,
      actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      ids: changeLogIdsForTaskUpdated(event, inGarden, () => queued.shift() ?? 'missing'),
    });
    expect(records.map((record) => record.kind)).toEqual([
      'TaskUpdated',
      'TaskRemovedFromProject',
    ]);
    expect(records[1]?.id).toBe('log-rm');
  });

  it('carries the task projectId on complete instead of null', () => {
    const inGarden: Task = { ...current, projectId: 'project-garden' };
    const records = changeLogRecordsFromTaskEvent({
      event: {
        type: 'TaskCompleted',
        id: 'task-1',
        organizationId: 'org-1',
        completedAt: '2025-01-15T12:00:00.000Z',
        occurredAt: '2025-01-15T12:00:00.000Z',
      },
      current: inGarden,
      actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      ids: { recordId: 'log-done' },
    });

    expect(records[0]?.projectId).toBe('project-garden');
  });
});
