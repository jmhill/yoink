import type { NamedList } from '@yoink/api-contracts';
import type { Actor } from '../../shared/actor.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import { applyNamedListCreated, applyNamedListRenamed } from './apply-named-list-event.js';
import {
  changeLogRecordsFromListEvent,
  type ListChangeLogIds,
} from './change-log-records.js';
import type {
  NamedListCreated,
  NamedListDeleted,
  NamedListRenamed,
  OpenTasksReordered,
} from './events.js';

export type { ListChangeLogIds };

type ListPlanBase = {
  actor: Actor | null;
  ids: ListChangeLogIds;
};

export type ListChangePlanInput =
  | {
      event: NamedListCreated;
      current: null;
    } & ListPlanBase
  | {
      event: NamedListRenamed;
      current: NamedList;
    } & ListPlanBase
  | {
      event: NamedListDeleted;
      current: NamedList | null;
    } & ListPlanBase
  | {
      event: OpenTasksReordered;
      current: NamedList | null;
    } & ListPlanBase;

export type ListChangePlan =
  | {
      action: 'insert';
      organizationId: string;
      view: NamedList;
      records: ChangeLogRecord[];
    }
  | {
      action: 'rename';
      organizationId: string;
      listId: string;
      name: string;
      view: NamedList;
      records: ChangeLogRecord[];
    }
  | {
      action: 'delete';
      organizationId: string;
      listId: string;
      records: ChangeLogRecord[];
    }
  | {
      action: 'reorder';
      organizationId: string;
      orders: { id: string; openOrder: number }[];
      records: ChangeLogRecord[];
    };

/**
 * Pure: event + pre-generated ids → next state and typed change-log records.
 * Always returns a plan — create/rename project without a null fallback.
 */
export function planListChange(
  input: Extract<ListChangePlanInput, { event: NamedListCreated }>
): Extract<ListChangePlan, { action: 'insert' }>;
export function planListChange(
  input: Extract<ListChangePlanInput, { event: NamedListRenamed }>
): Extract<ListChangePlan, { action: 'rename' }>;
export function planListChange(
  input: Extract<ListChangePlanInput, { event: NamedListDeleted }>
): Extract<ListChangePlan, { action: 'delete' }>;
export function planListChange(
  input: Extract<ListChangePlanInput, { event: OpenTasksReordered }>
): Extract<ListChangePlan, { action: 'reorder' }>;
export function planListChange(input: ListChangePlanInput): ListChangePlan;
export function planListChange(input: ListChangePlanInput): ListChangePlan {
  const records = changeLogRecordsFromListEvent({
    event: input.event,
    actor: input.actor,
    ids: input.ids,
  });

  if (input.event.type === 'NamedListCreated') {
    return {
      action: 'insert',
      organizationId: input.event.organizationId,
      view: applyNamedListCreated(input.event),
      records,
    };
  }
  if (input.event.type === 'NamedListRenamed') {
    const current = input.current as NamedList;
    return {
      action: 'rename',
      organizationId: input.event.organizationId,
      listId: input.event.id,
      name: input.event.name,
      view: applyNamedListRenamed(current, input.event),
      records,
    };
  }
  if (input.event.type === 'NamedListDeleted') {
    return {
      action: 'delete',
      organizationId: input.event.organizationId,
      listId: input.event.id,
      records,
    };
  }
  return {
    action: 'reorder',
    organizationId: input.event.organizationId,
    orders: input.event.orders,
    records,
  };
}
