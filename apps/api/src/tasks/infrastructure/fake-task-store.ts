import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type {
  TaskStore,
  FindByOrganizationOptions,
  FindByOrganizationResult,
} from '../domain/task-store.js';
import { storageError, type StorageError } from '../domain/task-errors.js';

export type FakeTaskStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialTasks?: Task[];
};

export const createFakeTaskStore = (
  options: FakeTaskStoreOptions = {}
): TaskStore => {
  const tasks: Task[] = [...(options.initialTasks ?? [])];
  const deletedIds = new Set<string>();

  return {
    save: (task: Task): ResultAsync<void, StorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(storageError('Save failed'));
      }
      tasks.push(task);
      return okAsync(undefined);
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

    update: (task: Task): ResultAsync<void, StorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(storageError('Update failed'));
      }
      const index = tasks.findIndex((t) => t.id === task.id);
      if (index !== -1) {
        tasks[index] = task;
      }
      return okAsync(undefined);
    },

    findByOrganization: (
      opts: FindByOrganizationOptions
    ): ResultAsync<FindByOrganizationResult, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }

      let filtered = tasks
        .filter((t) => t.organizationId === opts.organizationId)
        .filter((t) => !deletedIds.has(t.id));

      // Apply filter
      const today = opts.today ?? new Date().toISOString().split('T')[0];
      switch (opts.filter) {
        case 'today':
          filtered = filtered.filter((t) => t.dueDate === today && !t.completedAt);
          break;
        case 'upcoming':
          filtered = filtered.filter((t) => t.dueDate && t.dueDate > today && !t.completedAt);
          break;
        case 'completed':
          filtered = filtered.filter((t) => t.completedAt);
          break;
        case 'all':
        default:
          filtered = filtered.filter((t) => !t.completedAt);
          break;
      }

      // Sort: pinned first (by pinnedAt DESC), then by createdAt DESC
      if (opts.filter === 'completed') {
        filtered = filtered.sort((a, b) => {
          const aTime = new Date(a.completedAt!).getTime();
          const bTime = new Date(b.completedAt!).getTime();
          return bTime - aTime;
        });
      } else {
        filtered = filtered.sort((a, b) => {
          // Pinned items first
          if (a.pinnedAt && !b.pinnedAt) return -1;
          if (!a.pinnedAt && b.pinnedAt) return 1;
          if (a.pinnedAt && b.pinnedAt) {
            return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
          }
          // Then by createdAt DESC
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      }

      filtered = filtered.slice(0, opts.limit ?? Infinity);
      return okAsync({ tasks: filtered });
    },

    findByCaptureId: (captureId: string): ResultAsync<Task | null, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      const found = tasks.find((t) => t.captureId === captureId && !deletedIds.has(t.id));
      return okAsync(found ?? null);
    },

    softDelete: (id: string): ResultAsync<void, StorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(storageError('Delete failed'));
      }
      deletedIds.add(id);
      return okAsync(undefined);
    },
  };
};
