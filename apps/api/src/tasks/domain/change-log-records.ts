import type { Task } from '@yoink/api-contracts';
import type { Actor } from '../../shared/actor.js';
import { UNLISTED_PILE_SUBJECT_ID } from '../../shared/change-log/domain/kinds.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import type {
  TaskCreatedPayloadV1,
  TaskUpdatedPayloadV1,
} from '../../shared/change-log/domain/payloads.js';
import type { TaskEvent } from './events.js';

export type ChangeLogRecordsFromTaskEventInput = {
  event: TaskEvent;
  current: Task | null;
  actor: Actor | null;
  now: string;
  nextId: () => string;
};

const actorFields = (actor: Actor | null) => ({
  actorUserId: actor?.userId ?? null,
  actorKind: actor?.kind ?? null,
});

const envelope = (
  input: ChangeLogRecordsFromTaskEventInput,
  subject: { subjectType: 'task' | 'list'; subjectId: string; organizationId: string },
  occurredAt: string
) => ({
  id: input.nextId(),
  organizationId: subject.organizationId,
  projectId: null as string | null,
  subjectType: subject.subjectType,
  subjectId: subject.subjectId,
  schemaVersion: 1 as const,
  occurredAt,
  ...actorFields(input.actor),
});

/**
 * Typed, versioned change-log records built from the domain event.
 * No ad-hoc JSON — each kind has a payload object that parseChangeLogRecord checks on read.
 */
export const changeLogRecordsFromTaskEvent = (
  input: ChangeLogRecordsFromTaskEventInput
): ChangeLogRecord[] => {
  const { event, current } = input;

  switch (event.type) {
    case 'TaskCreated': {
      const payload: TaskCreatedPayloadV1 = {
        title: event.title,
        openOrder: event.openOrder,
        createdById: event.createdById,
      };
      if (event.dueDate !== undefined) payload.dueDate = event.dueDate;
      if (event.captureId !== undefined) payload.captureId = event.captureId;
      if (event.assigneeId !== undefined) payload.assigneeId = event.assigneeId;
      if (event.listId !== undefined) payload.listId = event.listId;
      return [
        {
          ...envelope(
            input,
            {
              subjectType: 'task',
              subjectId: event.id,
              organizationId: event.organizationId,
            },
            event.createdAt
          ),
          kind: 'TaskCreated',
          hidden: false,
          payload,
        },
      ];
    }
    case 'TaskUpdated': {
      const payload: TaskUpdatedPayloadV1 = {};
      if (event.title !== undefined) payload.title = event.title;
      if (event.dueDate !== undefined) payload.dueDate = event.dueDate;
      if (event.assigneeId !== undefined) payload.assigneeId = event.assigneeId;
      if (event.listId !== undefined) payload.listId = event.listId;
      if (event.openOrder !== undefined) payload.openOrder = event.openOrder;
      return [
        {
          ...envelope(
            input,
            {
              subjectType: 'task',
              subjectId: event.id,
              organizationId: event.organizationId,
            },
            input.now
          ),
          kind: 'TaskUpdated',
          hidden: false,
          payload,
        },
      ];
    }
    case 'TaskCompleted':
      return [
        {
          ...envelope(
            input,
            {
              subjectType: 'task',
              subjectId: event.id,
              organizationId: event.organizationId,
            },
            event.completedAt
          ),
          kind: 'TaskCompleted',
          hidden: false,
          payload: { completedAt: event.completedAt },
        },
      ];
    case 'TaskUncompleted': {
      const records: ChangeLogRecord[] = [
        {
          ...envelope(
            input,
            {
              subjectType: 'task',
              subjectId: event.id,
              organizationId: event.organizationId,
            },
            input.now
          ),
          kind: 'TaskUncompleted',
          hidden: false,
          payload: { openOrder: event.openOrder },
        },
      ];
      if (event.siblingOrders.length > 0) {
        const listId = current?.listId ?? null;
        records.push({
          ...envelope(
            input,
            {
              subjectType: 'list',
              subjectId: listId ?? UNLISTED_PILE_SUBJECT_ID,
              organizationId: event.organizationId,
            },
            input.now
          ),
          kind: 'OpenTasksRenumbered',
          hidden: true,
          payload: { listId, orders: event.siblingOrders },
        });
      }
      return records;
    }
    case 'TaskDeleted': {
      const payload: { captureId?: string } = {};
      if (event.captureId !== undefined) payload.captureId = event.captureId;
      return [
        {
          ...envelope(
            input,
            {
              subjectType: 'task',
              subjectId: event.id,
              organizationId: event.organizationId,
            },
            event.deletedAt
          ),
          kind: 'TaskDeleted',
          hidden: false,
          payload,
        },
      ];
    }
    case 'TaskPinned':
      return [
        {
          ...envelope(
            input,
            {
              subjectType: 'task',
              subjectId: event.id,
              organizationId: event.organizationId,
            },
            event.pinnedAt
          ),
          kind: 'TaskPinned',
          hidden: true,
          payload: { pinnedAt: event.pinnedAt },
        },
      ];
    case 'TaskUnpinned':
      return [
        {
          ...envelope(
            input,
            {
              subjectType: 'task',
              subjectId: event.id,
              organizationId: event.organizationId,
            },
            input.now
          ),
          kind: 'TaskUnpinned',
          hidden: true,
          payload: {},
        },
      ];
  }
};
