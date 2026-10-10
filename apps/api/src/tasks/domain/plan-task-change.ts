import type { Task } from '@yoink/api-contracts';
import type { Actor } from '../../shared/auth-context.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import { applyTaskCreated, applyTaskMutation } from './apply-task-event.js';
import {
  changeLogRecordsFromTaskEvent,
  type TaskChangeLogIds,
  type TaskUncompletedChangeLogIds,
  type TaskUpdatedChangeLogIds,
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

export type { TaskChangeLogIds, TaskUncompletedChangeLogIds, TaskUpdatedChangeLogIds };

export type CreateTaskChangeInput = {
  event: TaskCreated;
  current: null;
  actor: Actor;
  ids: TaskChangeLogIds;
};

export type UncompleteTaskChangeInput = {
  event: TaskUncompleted;
  current: Task;
  actor: Actor;
  ids: TaskUncompletedChangeLogIds;
};

export type UpdateTaskChangeInput = {
  event: TaskUpdated;
  current: Task;
  actor: Actor;
  ids: TaskUpdatedChangeLogIds;
};

export type MutateTaskChangeInput = {
  event: Exclude<TaskEvent, TaskCreated | TaskUncompleted | TaskUpdated>;
  current: Task;
  actor: Actor;
  ids: TaskChangeLogIds;
};

export type TaskChangePlanInput =
  | CreateTaskChangeInput
  | UncompleteTaskChangeInput
  | UpdateTaskChangeInput
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

const meta = (actor: Actor) => ({
  actorUserId: actor.userId,
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
  input: UpdateTaskChangeInput
): Extract<TaskChangePlan, { action: 'update' }>;
export function planTaskChange(
  input: {
    event: TaskCompleted | TaskPinned | TaskUnpinned;
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
