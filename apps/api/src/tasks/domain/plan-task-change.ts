import type { Task } from '@yoink/api-contracts';
import type { Actor } from '../../shared/actor.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import { applyTaskCreated, applyTaskMutation } from './apply-task-event.js';
import { changeLogRecordsFromTaskEvent } from './change-log-records.js';
import type { TaskCreated, TaskDeleted, TaskEvent } from './events.js';

export type TaskChangePlanInput =
  | {
      event: TaskCreated;
      current: null;
      actor: Actor | null;
      ids: readonly string[];
    }
  | {
      event: Exclude<TaskEvent, TaskCreated>;
      current: Task;
      actor: Actor | null;
      ids: readonly string[];
    };

export type TaskChangePlan =
  | {
      action: 'insert';
      organizationId: string;
      view: Task;
      records: ChangeLogRecord[];
    }
  | {
      action: 'update';
      organizationId: string;
      view: Task;
      records: ChangeLogRecord[];
    }
  | {
      action: 'uncomplete';
      organizationId: string;
      view: Task;
      siblingOrders: { id: string; openOrder: number }[];
      records: ChangeLogRecord[];
    }
  | {
      action: 'delete';
      organizationId: string;
      taskId: string;
      captureId?: string;
      deletedAt: string;
      records: ChangeLogRecord[];
    };

const recordsOf = (input: TaskChangePlanInput): ChangeLogRecord[] =>
  changeLogRecordsFromTaskEvent(input);

const meta = (actor: Actor | null) => ({
  actorUserId: actor?.userId ?? null,
});

const deletePlan = (event: TaskDeleted, records: ChangeLogRecord[]): TaskChangePlan => {
  const plan: TaskChangePlan = {
    action: 'delete',
    organizationId: event.organizationId,
    taskId: event.id,
    deletedAt: event.deletedAt,
    records,
  };
  if (event.captureId !== undefined) {
    plan.captureId = event.captureId;
  }
  return plan;
};

/**
 * Pure: event + pre-generated ids → next state and typed change-log records.
 * Persist only turns this plan into SQL (or fake mutations).
 */
export const planTaskChange = (input: TaskChangePlanInput): TaskChangePlan => {
  const { event, actor } = input;
  const records = recordsOf(input);

  if (event.type === 'TaskCreated') {
    return {
      action: 'insert',
      organizationId: event.organizationId,
      view: applyTaskCreated(event, meta(actor)),
      records,
    };
  }

  const current = input.current;
  if (current === null) {
    return {
      action: 'delete',
      organizationId: event.organizationId,
      taskId: event.id,
      deletedAt: event.type === 'TaskDeleted' ? event.deletedAt : event.occurredAt,
      records,
    };
  }

  switch (event.type) {
    case 'TaskUpdated':
    case 'TaskCompleted':
    case 'TaskPinned':
    case 'TaskUnpinned':
      return {
        action: 'update',
        organizationId: event.organizationId,
        view: applyTaskMutation(current, event, meta(actor)),
        records,
      };
    case 'TaskUncompleted':
      return {
        action: 'uncomplete',
        organizationId: event.organizationId,
        view: applyTaskMutation(current, event, meta(actor)),
        siblingOrders: event.siblingOrders,
        records,
      };
    case 'TaskDeleted':
      return deletePlan(event, records);
  }
};
