import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import { taskNotFoundError, type FindTaskError } from '../domain/task-errors.js';
import type { LoadTask } from './ports.js';

export const loadOwnedTask = (input: {
  id: string;
  organizationId: string;
  load: LoadTask;
}): ResultAsync<Task, FindTaskError> => {
  return input.load(input.id).andThen((task) => {
    if (!task || task.organizationId !== input.organizationId) {
      return errAsync(taskNotFoundError(input.id));
    }
    return okAsync(task);
  });
};
