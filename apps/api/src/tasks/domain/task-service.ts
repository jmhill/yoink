import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { TaskStore } from './task-store.js';
import type { FindTaskQuery } from './task-commands.js';
import type { FindTaskError } from './task-errors.js';
import { taskNotFoundError } from './task-errors.js';

export type TaskServiceDependencies = {
  store: TaskStore;
};

export type TaskService = {
  find: (query: FindTaskQuery) => ResultAsync<Task, FindTaskError>;
};

export const createTaskService = (deps: TaskServiceDependencies): TaskService => {
  const { store } = deps;

  return {
    find: (query: FindTaskQuery): ResultAsync<Task, FindTaskError> =>
      store.findById(query.id).andThen((task) => {
        if (!task || task.organizationId !== query.organizationId) {
          return errAsync(taskNotFoundError(query.id));
        }
        return okAsync(task);
      }),
  };
};
