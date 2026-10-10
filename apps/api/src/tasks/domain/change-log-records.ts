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
  TaskCompletedPayloadV1,
  TaskCreatedPayloadV1,
  TaskDeletedPayloadV1,
  TaskPinnedPayloadV1,
  TaskUncompletedPayloadV1,
  TaskUnpinnedPayloadV1,
  TaskUpdatedPayloadV1,
} from '../../shared/change-log/domain/payloads.js';
import type { TaskEvent } from './events.js';

export type TaskChangeLogIds = {
  recordId: string;
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

export type ChangeLogRecordsFromTaskEventInput =
  | UncompleteChangeLogRecordsInput
  | {
      event: Exclude<TaskEvent, { type: 'TaskUncompleted' }>;
      current: Task | null;
      actor: Actor;
      ids: TaskChangeLogIds;
    };

const isUncomplete = (
  value: ChangeLogRecordsFromTaskEventInput
): value is UncompleteChangeLogRecordsInput => value.event.type === 'TaskUncompleted';

const actorFields = (actor: Actor) => ({
  actorUserId: actor.userId,
  actorKind: actor.kind,
});

const envelope = (
  input: ChangeLogRecordsFromTaskEventInput,
  subject: { subjectType: 'task' | 'list'; subjectId: string; organizationId: string },
  occurredAt: string,
  recordId: string
) => ({
  id: recordId,
  organizationId: subject.organizationId,
  projectId: null as string | null,
  subjectType: subject.subjectType,
  subjectId: subject.subjectId,
  schemaVersion: 1 as const,
  occurredAt,
  ...actorFields(input.actor),
});

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
    return payload;
  },
  TaskUpdated: (event: Extract<TaskEvent, { type: 'TaskUpdated' }>): TaskUpdatedPayloadV1 => {
    const payload: TaskUpdatedPayloadV1 = {};
    if (event.title !== undefined) payload.title = event.title;
    if (event.dueDate !== undefined) payload.dueDate = event.dueDate;
    if (event.assigneeId !== undefined) payload.assigneeId = event.assigneeId;
    if (event.listId !== undefined) payload.listId = event.listId;
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
      ...envelope(input, subject, event.occurredAt, input.ids.recordId),
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
        input.ids.renumberRecordId
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

  const { event } = input;
  const subject = {
    subjectType: 'task' as const,
    subjectId: event.id,
    organizationId: event.organizationId,
  };

  switch (event.type) {
    case 'TaskCreated':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId),
          kind: 'TaskCreated',
          hidden: hiddenFor('TaskCreated'),
          payload: taskPayloadByType.TaskCreated(event),
        },
      ];
    case 'TaskUpdated':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId),
          kind: 'TaskUpdated',
          hidden: hiddenFor('TaskUpdated'),
          payload: taskPayloadByType.TaskUpdated(event),
        },
      ];
    case 'TaskCompleted':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId),
          kind: 'TaskCompleted',
          hidden: hiddenFor('TaskCompleted'),
          payload: taskPayloadByType.TaskCompleted(event),
        },
      ];
    case 'TaskDeleted':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId),
          kind: 'TaskDeleted',
          hidden: hiddenFor('TaskDeleted'),
          payload: taskPayloadByType.TaskDeleted(event),
        },
      ];
    case 'TaskPinned':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId),
          kind: 'TaskPinned',
          hidden: hiddenFor('TaskPinned'),
          payload: taskPayloadByType.TaskPinned(event),
        },
      ];
    case 'TaskUnpinned':
      return [
        {
          ...envelope(input, subject, event.occurredAt, input.ids.recordId),
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
