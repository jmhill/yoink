import type { NamedList } from '@yoink/api-contracts';
import type { Actor } from '../../shared/actor.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import { applyNamedListEvent } from './apply-named-list-event.js';
import { changeLogRecordsFromListEvent } from './change-log-records.js';
import type { ListEvent } from './events.js';

export type ListChangePlanInput = {
  event: ListEvent;
  current: NamedList | null;
  actor: Actor | null;
  ids: readonly string[];
};

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
 */
export const planListChange = (input: ListChangePlanInput): ListChangePlan | null => {
  const { event, current, actor, ids } = input;
  const records = changeLogRecordsFromListEvent({ event, actor, ids });

  switch (event.type) {
    case 'NamedListCreated': {
      const view = applyNamedListEvent(null, event);
      if (!view) {
        return null;
      }
      return {
        action: 'insert',
        organizationId: event.organizationId,
        view,
        records,
      };
    }
    case 'NamedListRenamed': {
      const view = applyNamedListEvent(current, event);
      if (!view) {
        return null;
      }
      return {
        action: 'rename',
        organizationId: event.organizationId,
        listId: event.id,
        name: event.name,
        view,
        records,
      };
    }
    case 'NamedListDeleted':
      return {
        action: 'delete',
        organizationId: event.organizationId,
        listId: event.id,
        records,
      };
    case 'OpenTasksReordered':
      return {
        action: 'reorder',
        organizationId: event.organizationId,
        orders: event.orders,
        records,
      };
  }
};
