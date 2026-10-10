import type { Task } from '@yoink/api-contracts';
import type { Actor } from '../../shared/auth-context.js';
import {
  UNLISTED_PILE_SUBJECT_ID,
  hiddenFor,
} from '../../shared/change-log/domain/kinds.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import type {
  NamedListCreatedPayloadV1,
  NamedListDeletedPayloadV1,
  NamedListRenamedPayloadV1,
  OpenTasksRenumberedPayloadV1,
  OpenTasksReorderedPayloadV1,
  TaskAddedToProjectPayloadV1,
  TaskCompletedPayloadV1,
  TaskCreatedPayloadV1,
  TaskDeletedPayloadV1,
  TaskPinnedPayloadV1,
  TaskRemovedFromProjectPayloadV1,
  TaskUncompletedPayloadV1,
  TaskUnpinnedPayloadV1,
  TaskUpdatedPayloadV1,
} from '../../shared/change-log/domain/payloads.js';
import type { TaskEvent, TaskUpdated } from './events.js';

export type TaskChangeLogIds = {
  recordId: string;
};

/**
 * One membership change, derived from the event + current task.
 * Added/Removed records are built from this — never from optional ids.
 */
export type ProjectMembershipChange =
  | { type: 'unchanged' }
  | { type: 'added'; projectId: string }
  | { type: 'removed'; projectId: string }
  | { type: 'moved'; fromProjectId: string; toProjectId: string };

export type TaskUpdatedMembershipIds =
  | { type: 'unchanged' }
  | { type: 'added'; addedToProjectRecordId: string; projectId: string }
  | { type: 'removed'; removedFromProjectRecordId: string; projectId: string }
  | {
      type: 'moved';
      addedToProjectRecordId: string;
      removedFromProjectRecordId: string;
      fromProjectId: string;
      toProjectId: string;
    };

export type TaskUpdatedChangeLogIds = {
  recordId: string;
  membership: TaskUpdatedMembershipIds;
};

export const projectMembershipChange = (
  event: TaskUpdated,
  current: Task | null
): ProjectMembershipChange => {
  if (event.projectId === undefined) {
    return { type: 'unchanged' };
  }
  const previous = current?.projectId ?? null;
  if (previous === event.projectId) {
    return { type: 'unchanged' };
  }
  if (previous === null) {
    if (event.projectId === null) {
      return { type: 'unchanged' };
    }
    return { type: 'added', projectId: event.projectId };
  }
  if (event.projectId === null) {
    return { type: 'removed', projectId: previous };
  }
  return {
    type: 'moved',
    fromProjectId: previous,
    toProjectId: event.projectId,
  };
};

export const changeLogIdsForTaskUpdated = (
  event: TaskUpdated,
  current: Task | null,
  nextId: () => string
): TaskUpdatedChangeLogIds => {
  const change = projectMembershipChange(event, current);
  const recordId = nextId();
  switch (change.type) {
    case 'unchanged':
      return { recordId, membership: { type: 'unchanged' } };
    case 'added':
      return {
        recordId,
        membership: {
          type: 'added',
          addedToProjectRecordId: nextId(),
          projectId: change.projectId,
        },
      };
    case 'removed':
      return {
        recordId,
        membership: {
          type: 'removed',
          removedFromProjectRecordId: nextId(),
          projectId: change.projectId,
        },
      };
    case 'moved':
      return {
        recordId,
        membership: {
          type: 'moved',
          removedFromProjectRecordId: nextId(),
          addedToProjectRecordId: nextId(),
          fromProjectId: change.fromProjectId,
          toProjectId: change.toProjectId,
        },
      };
  }
};

export type TaskUncompletedChangeLogIds = {
  recordId: string;
  renumberRecordId: string;
};

export type UncompleteChangeLogRecordsInput = {
  event: Extract<TaskEvent, { type: 'TaskUncompleted' }>;
  current: Task;
  actor: Actor;
  ids: TaskUncompletedChangeLogIds;
};

export type TaskUpdatedChangeLogInput = {
  event: TaskUpdated;
  current: Task | null;
  actor: Actor;
  ids: TaskUpdatedChangeLogIds;
};

export type ChangeLogRecordsFromTaskEventInput =
  | UncompleteChangeLogRecordsInput
  | TaskUpdatedChangeLogInput
  | {
      event: Exclude<TaskEvent, { type: 'TaskUncompleted' } | { type: 'TaskUpdated' }>;
      current: Task | null;
      actor: Actor;
      ids: TaskChangeLogIds;
    };

const isUncomplete = (
  value: ChangeLogRecordsFromTaskEventInput
): value is UncompleteChangeLogRecordsInput => value.event.type === 'TaskUncompleted';

const isTaskUpdatedInput = (
  value: ChangeLogRecordsFromTaskEventInput
): value is TaskUpdatedChangeLogInput => value.event.type === 'TaskUpdated';

const actorFields = (actor: Actor) => ({
  actorUserId: actor.userId,
  actorKind: actor.kind,
});

const envelope = (
  input: ChangeLogRecordsFromTaskEventInput,
  subject: { subjectType: 'task' | 'list'; subjectId: string; organizationId: string },
  occurredAt: string,
  recordId: string,
  projectId: string | null
) => ({
  id: recordId,
  organizationId: subject.organizationId,
  projectId,
  subjectType: subject.subjectType,
  subjectId: subject.subjectId,
  schemaVersion: 1 as const,
  occurredAt,
  ...actorFields(input.actor),
});

/**
 * Create writes TaskCreated with projectId and no extra Added record.
 * The task comes into existence already in that project; Added/Removed are
 * membership changes on a task that already exists.
 */
const projectIdAfterEvent = (
  event: TaskEvent,
  current: Task | null
): string | null => {
  if (event.type === 'TaskCreated') {
    return event.projectId ?? null;
  }
  if (event.type === 'TaskUpdated' && event.projectId !== undefined) {
    return event.projectId;
  }
  return current?.projectId ?? null;
};

const taskPayloadByType = {
  TaskCreated: (event: Extract<TaskEvent, { type: 'TaskCreated' }>): TaskCreatedPayloadV1 => {
    const payload: TaskCreatedPayloadV1 = {
      title: event.title,
      openOrder: event.openOrder,
      createdById: event.createdById,
    };
    if (event.dueDate !== undefined) payload.dueDate = event.dueDate;
    if (event.captureId !== undefined) payload.captureId = event.captureId;
    if (event.assigneeId !== undefined) payload.assigneeId = event.assigneeId;
    if (event.listId !== undefined) payload.listId = event.listId;
    if (event.projectId !== undefined) payload.projectId = event.projectId;
    return payload;
  },
  TaskUpdated: (event: Extract<TaskEvent, { type: 'TaskUpdated' }>): TaskUpdatedPayloadV1 => {
    const payload: TaskUpdatedPayloadV1 = {};
    if (event.title !== undefined) payload.title = event.title;
    if (event.dueDate !== undefined) payload.dueDate = event.dueDate;
    if (event.assigneeId !== undefined) payload.assigneeId = event.assigneeId;
    if (event.listId !== undefined) payload.listId = event.listId;
    if (event.projectId !== undefined) payload.projectId = event.projectId;
    if (event.openOrder !== undefined) payload.openOrder = event.openOrder;
    return payload;
  },
  TaskCompleted: (
    event: Extract<TaskEvent, { type: 'TaskCompleted' }>
  ): TaskCompletedPayloadV1 => ({
    completedAt: event.completedAt,
  }),
  TaskUncompleted: (
    event: Extract<TaskEvent, { type: 'TaskUncompleted' }>
  ): TaskUncompletedPayloadV1 => ({
    openOrder: event.openOrder,
  }),
  TaskDeleted: (event: Extract<TaskEvent, { type: 'TaskDeleted' }>): TaskDeletedPayloadV1 => {
    const payload: TaskDeletedPayloadV1 = {};
    if (event.captureId !== undefined) payload.captureId = event.captureId;
    return payload;
  },
  TaskPinned: (event: Extract<TaskEvent, { type: 'TaskPinned' }>): TaskPinnedPayloadV1 => ({
    pinnedAt: event.pinnedAt,
  }),
  TaskUnpinned: (_event: Extract<TaskEvent, { type: 'TaskUnpinned' }>): TaskUnpinnedPayloadV1 =>
    ({}),
} satisfies {
  [K in TaskEvent['type']]: (event: Extract<TaskEvent, { type: K }>) => unknown;
};

const membershipRecords = (
  input: TaskUpdatedChangeLogInput,
  subject: { subjectType: 'task'; subjectId: string; organizationId: string }
): ChangeLogRecord[] => {
  const { event, ids } = input;
  const membership = ids.membership;
  switch (membership.type) {
    case 'unchanged':
      return [];
    case 'removed': {
      const payload: TaskRemovedFromProjectPayloadV1 = { projectId: membership.projectId };
      return [
        {
          ...envelope(
            input,
            subject,
            event.occurredAt,
            membership.removedFromProjectRecordId,
            membership.projectId
          ),
          kind: 'TaskRemovedFromProject',
          hidden: hiddenFor('TaskRemovedFromProject'),
          payload,
        },
      ];
    }
    case 'added': {
      const payload: TaskAddedToProjectPayloadV1 = { projectId: membership.projectId };
      return [
        {
          ...envelope(
            input,
            subject,
            event.occurredAt,
            membership.addedToProjectRecordId,
            membership.projectId
          ),
          kind: 'TaskAddedToProject',
          hidden: hiddenFor('TaskAddedToProject'),
          payload,
        },
      ];
    }
    case 'moved': {
      const removedPayload: TaskRemovedFromProjectPayloadV1 = {
        projectId: membership.fromProjectId,
      };
      const addedPayload: TaskAddedToProjectPayloadV1 = { projectId: membership.toProjectId };
      return [
        {
          ...envelope(
            input,
            subject,
            event.occurredAt,
            membership.removedFromProjectRecordId,
            membership.fromProjectId
          ),
          kind: 'TaskRemovedFromProject',
          hidden: hiddenFor('TaskRemovedFromProject'),
          payload: removedPayload,
        },
        {
          ...envelope(
            input,
            subject,
            event.occurredAt,
            membership.addedToProjectRecordId,
            membership.toProjectId
          ),
          kind: 'TaskAddedToProject',
          hidden: hiddenFor('TaskAddedToProject'),
          payload: addedPayload,
        },
      ];
    }
  }
};

const recordsForUncomplete = (
  input: UncompleteChangeLogRecordsInput
): ChangeLogRecord[] => {
  const { event, current } = input;
  const subject = {
    subjectType: 'task' as const,
    subjectId: event.id,
    organizationId: event.organizationId,
  };
  const records: ChangeLogRecord[] = [
    {
      ...envelope(
        input,
        subject,
        event.occurredAt,
        input.ids.recordId,
        current.projectId ?? null
      ),
      kind: 'TaskUncompleted',
      hidden: hiddenFor('TaskUncompleted'),
      payload: taskPayloadByType.TaskUncompleted(event),
    },
  ];
  if (event.siblingOrders.length > 0) {
    const listId = current.listId ?? null;
    const renumberPayload: OpenTasksRenumberedPayloadV1 = {
      listId,
      orders: event.siblingOrders,
    };
    records.push({
      ...envelope(
        input,
        {
          subjectType: 'list',
          subjectId: listId ?? UNLISTED_PILE_SUBJECT_ID,
          organizationId: event.organizationId,
        },
        event.occurredAt,
        input.ids.renumberRecordId,
        null
      ),
      kind: 'OpenTasksRenumbered',
      hidden: hiddenFor('OpenTasksRenumbered'),
      payload: renumberPayload,
    });
  }
  return records;
};

/**
 * Typed, versioned change-log records built from the domain event.
 * Ids are data — the caller pre-generates them by name.
 */
export const changeLogRecordsFromTaskEvent = (
  input: ChangeLogRecordsFromTaskEventInput
): ChangeLogRecord[] => {
  if (isUncomplete(input)) {
    return recordsForUncomplete(input);
  }
  if (isTaskUpdatedInput(input)) {
    const subject = {
      subjectType: 'task' as const,
      subjectId: input.event.id,
      organizationId: input.event.organizationId,
    };
    const projectId = projectIdAfterEvent(input.event, input.current);
    return [
      {
        ...envelope(input, subject, input.event.occurredAt, input.ids.recordId, projectId),
        kind: 'TaskUpdated',
        hidden: hiddenFor('TaskUpdated'),
        payload: taskPayloadByType.TaskUpdated(input.event),
      },
      ...membershipRecords(input, subject),
    ];
  }

  const { event } = input;
  const subject = {
    subjectType: 'task' as const,
    subjectId: event.id,
    organizationId: event.organizationId,
  };
  const projectId = projectIdAfterEvent(event, input.current);

  switch (event.type) {
    case 'TaskCreated':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId, projectId),
          kind: 'TaskCreated',
          hidden: hiddenFor('TaskCreated'),
          payload: taskPayloadByType.TaskCreated(event),
        },
      ];
    case 'TaskCompleted':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId, projectId),
          kind: 'TaskCompleted',
          hidden: hiddenFor('TaskCompleted'),
          payload: taskPayloadByType.TaskCompleted(event),
        },
      ];
    case 'TaskDeleted':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId, projectId),
          kind: 'TaskDeleted',
          hidden: hiddenFor('TaskDeleted'),
          payload: taskPayloadByType.TaskDeleted(event),
        },
      ];
    case 'TaskPinned':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId, projectId),
          kind: 'TaskPinned',
          hidden: hiddenFor('TaskPinned'),
          payload: taskPayloadByType.TaskPinned(event),
        },
      ];
    case 'TaskUnpinned':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId, projectId),
          kind: 'TaskUnpinned',
          hidden: hiddenFor('TaskUnpinned'),
          payload: taskPayloadByType.TaskUnpinned(event),
        },
      ];
  }
};

export const listPayloadByType = {
  NamedListCreated: (
    event: { name: string; createdById: string }
  ): NamedListCreatedPayloadV1 => ({
    name: event.name,
    createdById: event.createdById,
  }),
  NamedListRenamed: (event: { name: string }): NamedListRenamedPayloadV1 => ({
    name: event.name,
  }),
  NamedListDeleted: (): NamedListDeletedPayloadV1 => ({}),
  OpenTasksReordered: (event: {
    listId: string | null;
    orders: { id: string; openOrder: number }[];
  }): OpenTasksReorderedPayloadV1 => ({
    listId: event.listId,
    orders: event.orders,
  }),
};
