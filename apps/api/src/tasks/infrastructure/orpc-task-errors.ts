import { ORPCError } from '@orpc/server';
import type { ListTaskHistoryError } from '../../modules/history/index.js';
import { yoinkHttpError, yoinkServerError } from '../../edges/_shared/orpc/yoink-http-error.js';
import type {
  CompleteTaskError,
  CreateTaskError,
  DeleteTaskError,
  FindTaskError,
  ListTasksError,
  PinTaskError,
  TaskNotOpenField,
  UncompleteTaskError,
  UnpinTaskError,
  UpdateTaskError,
} from '../domain/task-errors.js';

const taskMissing = (cause: unknown) =>
  yoinkHttpError({
    code: 'NOT_FOUND',
    message: 'Task not found',
    cause,
  });

const projectMissing = (cause: unknown) =>
  yoinkHttpError({
    code: 'NOT_FOUND',
    message: 'Project not found',
    cause,
  });

const badRequest = (message: string, cause: unknown) =>
  yoinkHttpError({
    code: 'BAD_REQUEST',
    message,
    cause,
  });

const invalidCursor = (error: { readonly message: string }) =>
  new ORPCError('INVALID_CURSOR', {
    message: error.message,
    cause: error,
  });

const taskNotOpenMessage = (field: TaskNotOpenField): string => {
  switch (field) {
    case 'project':
      return 'Only open tasks can be added to or taken off a project';
    case 'list':
      return 'Only open tasks can be added to or taken off a list';
    default: {
      const _never: never = field;
      return _never;
    }
  }
};

export const mapCreateTaskError = (error: CreateTaskError) => {
  switch (error.type) {
    case 'ASSIGNEE_NOT_IN_ORGANIZATION':
      return badRequest('Assignee is not a member of this organization', error);
    case 'LIST_NOT_IN_ORGANIZATION':
      return badRequest('List is not in this organization', error);
    case 'PROJECT_NOT_IN_ORGANIZATION':
      return projectMissing(error);
    case 'PROJECT_DONE':
      return badRequest('Cannot add a task to a done project', error);
    case 'PROJECT_PROPOSED':
      return badRequest('A proposed project cannot have tasks', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to create task', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to create task', _never);
    }
  }
};

export const mapListTasksError = (error: ListTasksError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list tasks', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list tasks', _never);
    }
  }
};

export const mapFindTaskError = (error: FindTaskError) => {
  switch (error.type) {
    case 'TASK_NOT_FOUND':
      return taskMissing(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to get task', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to get task', _never);
    }
  }
};

export const mapUpdateTaskError = (error: UpdateTaskError) => {
  switch (error.type) {
    case 'TASK_NOT_FOUND':
      return taskMissing(error);
    case 'ASSIGNEE_NOT_IN_ORGANIZATION':
      return badRequest('Assignee is not a member of this organization', error);
    case 'LIST_NOT_IN_ORGANIZATION':
      return badRequest('List is not in this organization', error);
    case 'PROJECT_NOT_IN_ORGANIZATION':
      return projectMissing(error);
    case 'PROJECT_DONE':
      return badRequest('Cannot add a task to a done project', error);
    case 'PROJECT_PROPOSED':
      return badRequest('A proposed project cannot have tasks', error);
    case 'TASK_NOT_OPEN':
      return badRequest(taskNotOpenMessage(error.field), error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to update task', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to update task', _never);
    }
  }
};

export const mapCompleteTaskError = (error: CompleteTaskError) => {
  switch (error.type) {
    case 'TASK_NOT_FOUND':
      return taskMissing(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to complete task', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to complete task', _never);
    }
  }
};

export const mapUncompleteTaskError = (error: UncompleteTaskError) => {
  switch (error.type) {
    case 'TASK_NOT_FOUND':
      return taskMissing(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to uncomplete task', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to uncomplete task', _never);
    }
  }
};

export const mapPinTaskError = (error: PinTaskError) => {
  switch (error.type) {
    case 'TASK_NOT_FOUND':
      return taskMissing(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to pin task', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to pin task', _never);
    }
  }
};

export const mapUnpinTaskError = (error: UnpinTaskError) => {
  switch (error.type) {
    case 'TASK_NOT_FOUND':
      return taskMissing(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to unpin task', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to unpin task', _never);
    }
  }
};

export const mapListTaskHistoryError = (error: ListTaskHistoryError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'TASK_NOT_FOUND':
      return yoinkHttpError({
        code: 'NOT_FOUND',
        message: 'Task not found',
        bodyCode: 'TASK_NOT_FOUND',
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list task history', error, 'STORAGE_ERROR');
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list task history', _never, 'STORAGE_ERROR');
    }
  }
};

export const mapDeleteTaskError = (error: DeleteTaskError) => {
  switch (error.type) {
    case 'TASK_NOT_FOUND':
      return taskMissing(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to delete task', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to delete task', _never);
    }
  }
};
