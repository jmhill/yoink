import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { TaskStore, FindByOrganizationOptions } from '../domain/task-store.js';
import { storageError, type StorageError } from '../domain/task-errors.js';
import { compareOpenOrder, nextOpenOrder } from '../domain/open-order.js';
import {
  compareKeyset,
  pageOrdered,
} from '../../listing/domain/keyset-window.js';
import {
  completedTaskDirection,
  completedTaskKeys,
  openPileTaskDirection,
  openPileTaskKeys,
  taskBoardDirection,
  taskBoardKeys,
} from '../../listing/domain/list-keys.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';

export type FakeTaskStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialTasks?: Task[];
};

export type FakeTaskStore = TaskStore & {
  captureSnapshot: () => () => void;
  applyInsert: (task: Task) => void;
  applyReplace: (task: Task) => void;
  applySoftDelete: (id: string) => void;
  applySetOpenOrders: (updates: { id: string; openOrder: number }[]) => void;
  applyClearListIdOnCompleted: (listId: string) => void;
};

export const createFakeTaskStore = (
  options: FakeTaskStoreOptions = {}
): FakeTaskStore => {
  const tasks: Task[] = [...(options.initialTasks ?? [])];
  const deletedIds = new Set<string>();

  return {
    captureSnapshot: () => {
      const tasksCopy = tasks.map((task) => ({ ...task }));
      const deletedCopy = new Set(deletedIds);
      return () => {
        tasks.length = 0;
        tasks.push(...tasksCopy);
        deletedIds.clear();
        for (const id of deletedCopy) {
          deletedIds.add(id);
        }
      };
    },
    applyInsert: (task: Task) => {
      tasks.push(task);
    },
    applyReplace: (task: Task) => {
      const index = tasks.findIndex((item) => item.id === task.id);
      if (index !== -1) {
        tasks[index] = task;
      }
    },
    applySoftDelete: (id: string) => {
      deletedIds.add(id);
    },
    applySetOpenOrders: (updates: { id: string; openOrder: number }[]) => {
      for (const update of updates) {
        const task = tasks.find((item) => item.id === update.id);
        if (task) {
          task.openOrder = update.openOrder;
        }
      }
    },
    applyClearListIdOnCompleted: (listId: string) => {
      for (const task of tasks) {
        const notOpen = Boolean(task.completedAt) || deletedIds.has(task.id);
        if (task.listId === listId && notOpen) {
          delete task.listId;
        }
      }
    },

    findById: (id: string): ResultAsync<Task | null, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      if (deletedIds.has(id)) {
        return okAsync(null);
      }
      const found = tasks.find((t) => t.id === id);
      return okAsync(found ?? null);
    },

    findByOrganization: (
      opts: FindByOrganizationOptions
    ): ResultAsync<KeysetRows<Task>, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }

      let filtered = tasks
        .filter((t) => t.organizationId === opts.organizationId)
        .filter((t) => !deletedIds.has(t.id));

      const today = opts.today ?? new Date().toISOString().split('T')[0];
      switch (opts.filter) {
        case 'today':
          filtered = filtered.filter((t) => t.dueDate && t.dueDate <= today && !t.completedAt);
          break;
        case 'upcoming':
          filtered = filtered.filter((t) => t.dueDate && t.dueDate > today && !t.completedAt);
          break;
        case 'completed':
          filtered = filtered.filter((t) => t.completedAt);
          break;
        case 'mine':
          filtered = filtered.filter(
            (t) =>
              Boolean(opts.assigneeId) &&
              t.assigneeId === opts.assigneeId &&
              !t.completedAt
          );
          break;
        case 'all':
        default:
          filtered = filtered.filter((t) => !t.completedAt);
          break;
      }

      const keysOf = opts.filter === 'completed' ? completedTaskKeys : taskBoardKeys;
      const direction =
        opts.filter === 'completed' ? completedTaskDirection : taskBoardDirection;
      const ordered = [...filtered].sort((a, b) => {
        const cmp = compareKeyset(keysOf(a), keysOf(b));
        return direction === 'asc' ? cmp : -cmp;
      });

      return okAsync(
        pageOrdered({
          ordered,
          keysOf,
          direction,
          fetchLimit: opts.fetchLimit,
          seek: opts.seek,
        })
      );
    },

    findByCaptureId: (captureId: string): ResultAsync<Task | null, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      const found = tasks.find((t) => t.captureId === captureId && !deletedIds.has(t.id));
      return okAsync(found ?? null);
    },

    countOpenOnList: (listId: string): ResultAsync<number, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      const count = tasks.filter(
        (task) =>
          task.listId === listId &&
          !task.completedAt &&
          !deletedIds.has(task.id)
      ).length;
      return okAsync(count);
    },

    pageOpenInPile: (pile: {
      organizationId: string;
      listId: string | null;
      fetchLimit: number;
      seek?: KeysetCursor;
    }): ResultAsync<KeysetRows<Task>, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      const open = tasks
        .filter((task) => task.organizationId === pile.organizationId)
        .filter((task) => !deletedIds.has(task.id))
        .filter((task) => !task.completedAt)
        .filter((task) => (task.listId ?? null) === pile.listId)
        .sort((a, b) => compareKeyset(openPileTaskKeys(a), openPileTaskKeys(b)));
      return okAsync(
        pageOrdered({
          ordered: open,
          keysOf: openPileTaskKeys,
          direction: openPileTaskDirection,
          fetchLimit: pile.fetchLimit,
          seek: pile.seek,
        })
      );
    },

    findOpenInPile: (pile: {
      organizationId: string;
      listId: string | null;
    }): ResultAsync<Task[], StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      const open = tasks
        .filter((task) => task.organizationId === pile.organizationId)
        .filter((task) => !deletedIds.has(task.id))
        .filter((task) => !task.completedAt)
        .filter((task) => (task.listId ?? null) === pile.listId)
        .sort(compareOpenOrder);
      return okAsync(open);
    },

    nextOpenOrderInPile: (pile: {
      organizationId: string;
      listId: string | null;
    }): ResultAsync<number, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      const open = tasks
        .filter((task) => task.organizationId === pile.organizationId)
        .filter((task) => !deletedIds.has(task.id))
        .filter((task) => !task.completedAt)
        .filter((task) => (task.listId ?? null) === pile.listId);
      return okAsync(nextOpenOrder(open));
    },

  };
};
