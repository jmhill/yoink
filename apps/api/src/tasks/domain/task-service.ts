import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { TaskStore, FindByOrganizationResult } from './task-store.js';
import type {
  CreateTaskCommand,
  ListTasksQuery,
  FindTaskQuery,
  UpdateTaskCommand,
  CompleteTaskCommand,
  UncompleteTaskCommand,
  PinTaskCommand,
  UnpinTaskCommand,
  DeleteTaskCommand,
} from './task-commands.js';
import type {
  CreateTaskError,
  ListTasksError,
  FindTaskError,
  UpdateTaskError,
  CompleteTaskError,
  UncompleteTaskError,
  PinTaskError,
  UnpinTaskError,
  DeleteTaskError,
} from './task-errors.js';
import { taskNotFoundError } from './task-errors.js';

export type TaskServiceDependencies = {
  store: TaskStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

export type ListTasksResult = FindByOrganizationResult;

export type TaskService = {
  create: (command: CreateTaskCommand) => ResultAsync<Task, CreateTaskError>;
  list: (query: ListTasksQuery) => ResultAsync<ListTasksResult, ListTasksError>;
  find: (query: FindTaskQuery) => ResultAsync<Task, FindTaskError>;
  update: (command: UpdateTaskCommand) => ResultAsync<Task, UpdateTaskError>;
  complete: (command: CompleteTaskCommand) => ResultAsync<Task, CompleteTaskError>;
  uncomplete: (command: UncompleteTaskCommand) => ResultAsync<Task, UncompleteTaskError>;
  pin: (command: PinTaskCommand) => ResultAsync<Task, PinTaskError>;
  unpin: (command: UnpinTaskCommand) => ResultAsync<Task, UnpinTaskError>;
  delete: (command: DeleteTaskCommand) => ResultAsync<void, DeleteTaskError>;
};

/**
 * Helper to get today's date in YYYY-MM-DD format
 */
const getToday = (clock: Clock): string => {
  return clock.now().toISOString().split('T')[0];
};

export const createTaskService = (
  deps: TaskServiceDependencies
): TaskService => {
  const { store, clock, idGenerator } = deps;

  const findAndValidateOwnership = (
    id: string,
    organizationId: string
  ): ResultAsync<Task, FindTaskError> => {
    return store.findById(id).andThen((task) => {
      if (!task || task.organizationId !== organizationId) {
        return errAsync(taskNotFoundError(id));
      }
      return okAsync(task);
    });
  };

  return {
    create: (command: CreateTaskCommand): ResultAsync<Task, CreateTaskError> => {
      const task: Task = {
        id: idGenerator.generate(),
        organizationId: command.organizationId,
        createdById: command.createdById,
        title: command.title,
        captureId: command.captureId,
        dueDate: command.dueDate,
        createdAt: clock.now().toISOString(),
      };

      return store.save(task).map(() => task);
    },

    list: (query: ListTasksQuery): ResultAsync<ListTasksResult, ListTasksError> => {
      return store.findByOrganization({
        organizationId: query.organizationId,
        filter: query.filter,
        today: getToday(clock),
        limit: query.limit,
        cursor: query.cursor,
      });
    },

    find: (query: FindTaskQuery): ResultAsync<Task, FindTaskError> => {
      return findAndValidateOwnership(query.id, query.organizationId);
    },

    update: (command: UpdateTaskCommand): ResultAsync<Task, UpdateTaskError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        const updatedTask: Task = {
          ...existing,
          title: command.title ?? existing.title,
          // Handle dueDate: undefined means "don't change", null means "clear", string means "set"
          dueDate: command.dueDate === undefined
            ? existing.dueDate
            : command.dueDate === null
              ? undefined
              : command.dueDate,
        };

        return store.update(updatedTask).map(() => updatedTask);
      });
    },

    complete: (command: CompleteTaskCommand): ResultAsync<Task, CompleteTaskError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Idempotent: if already completed, just return as-is
        if (existing.completedAt) {
          return okAsync(existing);
        }

        const updatedTask: Task = {
          ...existing,
          completedAt: clock.now().toISOString(),
        };

        return store.update(updatedTask).map(() => updatedTask);
      });
    },

    uncomplete: (command: UncompleteTaskCommand): ResultAsync<Task, UncompleteTaskError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Idempotent: if not completed, just return as-is
        if (!existing.completedAt) {
          return okAsync(existing);
        }

        const updatedTask: Task = {
          ...existing,
          completedAt: undefined,
        };

        return store.update(updatedTask).map(() => updatedTask);
      });
    },

    pin: (command: PinTaskCommand): ResultAsync<Task, PinTaskError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Idempotent: if already pinned, just return as-is
        if (existing.pinnedAt) {
          return okAsync(existing);
        }

        const updatedTask: Task = {
          ...existing,
          pinnedAt: clock.now().toISOString(),
        };

        return store.update(updatedTask).map(() => updatedTask);
      });
    },

    unpin: (command: UnpinTaskCommand): ResultAsync<Task, UnpinTaskError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Idempotent: if not pinned, just return as-is
        if (!existing.pinnedAt) {
          return okAsync(existing);
        }

        const updatedTask: Task = {
          ...existing,
          pinnedAt: undefined,
        };

        return store.update(updatedTask).map(() => updatedTask);
      });
    },

    delete: (command: DeleteTaskCommand): ResultAsync<void, DeleteTaskError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen(() => {
        return store.softDelete(command.id);
      });
    },
  };
};
