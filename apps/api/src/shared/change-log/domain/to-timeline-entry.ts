import type {
  TimelineDetails,
  TimelineEntry,
  TimelineEntryKind,
} from '@yoink/api-contracts';
import type { ChangeLogRecord } from './record.js';
import type { TaskUpdatedPayloadV1 } from './payloads.js';

export type SubjectLookup = {
  title: string | null;
  deleted: boolean;
};

export type TimelineLookups = {
  subjectOf: (type: 'task' | 'project', id: string) => SubjectLookup;
  taskTitleOf: (id: string) => string | null;
  actorNameOf: (userId: string | null) => string;
};

export const UNKNOWN_ACTOR_NAME = 'Unknown';

export const taskUpdatedShowsOnTimeline = (payload: TaskUpdatedPayloadV1): boolean =>
  payload.title !== undefined ||
  payload.dueDate !== undefined ||
  payload.assigneeId !== undefined ||
  payload.listId !== undefined;

const taskUpdatedDetails = (payload: TaskUpdatedPayloadV1): TimelineDetails | null => {
  if (!taskUpdatedShowsOnTimeline(payload)) {
    return null;
  }
  const details: Extract<TimelineDetails, { kind: 'TaskUpdated' }> = {
    kind: 'TaskUpdated',
  };
  if (payload.title !== undefined) {
    details.title = payload.title;
  }
  if (payload.previousTitle !== undefined) {
    details.previousTitle = payload.previousTitle;
  }
  if (payload.dueDate !== undefined) {
    details.dueDate = payload.dueDate;
  }
  if (payload.assigneeId !== undefined) {
    details.assigneeId = payload.assigneeId;
  }
  if (payload.listId !== undefined) {
    details.listId = payload.listId;
  }
  return details;
};

const timelineSubjectTypeFor = (
  kind: Exclude<TimelineEntryKind, 'Unknown'>
): 'task' | 'project' => {
  switch (kind) {
    case 'ProjectCreated':
    case 'ProjectUpdated':
    case 'ProjectStatusChanged':
    case 'ProjectWaitingChanged':
    case 'ProjectNextActionSet':
    case 'ProjectNextActionCleared':
    case 'ProjectImported':
      return 'project';
    case 'TaskCreated':
    case 'TaskUpdated':
    case 'TaskCompleted':
    case 'TaskUncompleted':
    case 'TaskDeleted':
    case 'TaskAddedToProject':
    case 'TaskRemovedFromProject':
      return 'task';
  }
};

const subjectFor = (
  record: ChangeLogRecord,
  lookups: TimelineLookups,
  kind: Exclude<TimelineEntryKind, 'Unknown'>
) => {
  const type = timelineSubjectTypeFor(kind);
  const lookedUp = lookups.subjectOf(type, record.subjectId);
  return {
    type,
    id: record.subjectId,
    title: lookedUp.title,
    deleted: lookedUp.deleted,
  };
};

const entry = (
  record: ChangeLogRecord,
  lookups: TimelineLookups,
  kind: Exclude<TimelineEntryKind, 'Unknown'>,
  details: TimelineDetails
): TimelineEntry => ({
  id: record.id,
  kind,
  occurredAt: record.occurredAt,
  actor: {
    userId: record.actorUserId,
    kind: record.actorKind,
    name: lookups.actorNameOf(record.actorUserId),
  },
  subject: subjectFor(record, lookups, kind),
  details,
});

/**
 * Map a typed change-log record to a timeline entry, or null when it
 * must not show (hidden kinds, list-only kinds, TaskUpdated that only
 * moved projects). Exhaustive over ChangeLogKind so #139 fails the build.
 */
export const toTimelineEntry = (
  record: ChangeLogRecord,
  lookups: TimelineLookups
): TimelineEntry | null => {
  switch (record.kind) {
    case 'TaskPinned':
    case 'TaskUnpinned':
    case 'OpenTasksReordered':
    case 'OpenTasksRenumbered':
    case 'NamedListCreated':
    case 'NamedListRenamed':
    case 'NamedListDeleted':
      return null;
    case 'TaskCreated':
      return entry(record, lookups, 'TaskCreated', { kind: 'TaskCreated' });
    case 'TaskUpdated': {
      const details = taskUpdatedDetails(record.payload);
      return details ? entry(record, lookups, 'TaskUpdated', details) : null;
    }
    case 'TaskCompleted':
      return entry(record, lookups, 'TaskCompleted', { kind: 'TaskCompleted' });
    case 'TaskUncompleted':
      return entry(record, lookups, 'TaskUncompleted', { kind: 'TaskUncompleted' });
    case 'TaskDeleted':
      return entry(record, lookups, 'TaskDeleted', { kind: 'TaskDeleted' });
    case 'ProjectCreated':
      return entry(record, lookups, 'ProjectCreated', {
        kind: 'ProjectCreated',
        name: record.payload.name,
        ...(record.payload.objective !== undefined
          ? { objective: record.payload.objective }
          : {}),
      });
    case 'ProjectUpdated':
      return entry(record, lookups, 'ProjectUpdated', {
        kind: 'ProjectUpdated',
        ...(record.payload.name !== undefined ? { name: record.payload.name } : {}),
        ...(record.payload.objective !== undefined
          ? { objective: record.payload.objective }
          : {}),
      });
    case 'ProjectStatusChanged':
      return entry(record, lookups, 'ProjectStatusChanged', {
        kind: 'ProjectStatusChanged',
        from: record.payload.from,
        to: record.payload.to,
        ...(record.payload.waitingOn !== undefined
          ? { waitingOn: record.payload.waitingOn }
          : {}),
        ...(record.payload.waitingSince !== undefined
          ? { waitingSince: record.payload.waitingSince }
          : {}),
      });
    case 'ProjectWaitingChanged':
      return entry(record, lookups, 'ProjectWaitingChanged', {
        kind: 'ProjectWaitingChanged',
        waitingOn: record.payload.waitingOn,
        waitingSince: record.payload.waitingSince,
      });
    case 'ProjectNextActionSet':
      return entry(record, lookups, 'ProjectNextActionSet', {
        kind: 'ProjectNextActionSet',
        taskId: record.payload.taskId,
        taskTitle: lookups.taskTitleOf(record.payload.taskId),
        previousTaskId: record.payload.previousTaskId,
        previousTaskTitle: record.payload.previousTaskId
          ? lookups.taskTitleOf(record.payload.previousTaskId)
          : null,
      });
    case 'ProjectNextActionCleared':
      return entry(record, lookups, 'ProjectNextActionCleared', {
        kind: 'ProjectNextActionCleared',
        taskId: record.payload.taskId,
        taskTitle: lookups.taskTitleOf(record.payload.taskId),
        reason: record.payload.reason,
      });
    case 'TaskAddedToProject':
      return entry(record, lookups, 'TaskAddedToProject', {
        kind: 'TaskAddedToProject',
        projectId: record.payload.projectId,
      });
    case 'TaskRemovedFromProject':
      return entry(record, lookups, 'TaskRemovedFromProject', {
        kind: 'TaskRemovedFromProject',
        projectId: record.payload.projectId,
      });
    case 'ProjectImported':
      return entry(record, lookups, 'ProjectImported', {
        kind: 'ProjectImported',
        taskCount: record.payload.taskCount,
      });
  }
};

export const unknownTimelineEntry = (input: {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorKind: 'user' | 'bot' | null;
  subjectType: 'task' | 'project';
  subjectId: string;
  lookups: TimelineLookups;
}): TimelineEntry => {
  const lookedUp = input.lookups.subjectOf(input.subjectType, input.subjectId);
  return {
    id: input.id,
    kind: 'Unknown',
    occurredAt: input.occurredAt,
    actor: {
      userId: input.actorUserId,
      kind: input.actorKind,
      name: input.lookups.actorNameOf(input.actorUserId),
    },
    subject: {
      type: input.subjectType,
      id: input.subjectId,
      title: lookedUp.title,
      deleted: lookedUp.deleted,
    },
    details: { kind: 'Unknown' },
  };
};
