import type { Task } from '@yoink/api-contracts';
import type { Actor } from '../../shared/actor.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import { applyTaskCreated, applyTaskMutation } from './apply-task-event.js';
import {
  changeLogRecordsFromTaskEvent,
  type TaskChangeLogIds,
  type TaskUncompletedChangeLogIds,
} from './change-log-records.js';
import type {
  TaskCompleted,
  TaskCreated,
  TaskDeleted,
  TaskEvent,
  TaskPinned,
  TaskUncompleted,
  TaskUnpinned,
  TaskUpdated,
} from './events.js';

export type { TaskChangeLogIds, TaskUncompletedChangeLogIds };

export type CreateTaskChangeInput = {
  event: TaskCreated;
  current: null;
  actor: Actor | null;
  ids: TaskChangeLogIds;
};

export type UncompleteTaskChangeInput = {
  event: TaskUncompleted;
  current: Task;
  actor: Actor | null;
  ids: TaskUncompletedChangeLogIds;
};

export type MutateTaskChangeInput = {
  event: Exclude<TaskEvent, TaskCreated | TaskUncompleted>;
  current: Task;
  actor: Actor | null;
  ids: TaskChangeLogIds;
};

export type TaskChangePlanInput =
  | CreateTaskChangeInput
  | UncompleteTaskChangeInput
  | MutateTaskChangeInput;

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
 * Narrow on `current === null` for create; the mutate switch covers every other case.
 */
export function planTaskChange(
  input: CreateTaskChangeInput
): Extract<TaskChangePlan, { action: 'insert' }>;
export function planTaskChange(
  input: { event: TaskDeleted } & Omit<MutateTaskChangeInput, 'event'>
): Extract<TaskChangePlan, { action: 'delete' }>;
export function planTaskChange(
  input: UncompleteTaskChangeInput
): Extract<TaskChangePlan, { action: 'uncomplete' }>;
export function planTaskChange(
  input: {
    event: TaskUpdated | TaskCompleted | TaskPinned | TaskUnpinned;
  } & Omit<MutateTaskChangeInput, 'event'>
): Extract<TaskChangePlan, { action: 'update' }>;
export function planTaskChange(input: TaskChangePlanInput): TaskChangePlan;
export function planTaskChange(input: TaskChangePlanInput): TaskChangePlan {
  const records = recordsOf(input);

  if (input.current === null) {
    return {
      action: 'insert',
      organizationId: input.event.organizationId,
      view: applyTaskCreated(input.event, meta(input.actor)),
      records,
    };
  }

  const { event, current, actor } = input;
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
}
