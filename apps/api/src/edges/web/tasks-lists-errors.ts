import { ORPCError } from '@orpc/server';
import { yoinkHttpError, yoinkServerError } from '../_shared/orpc/yoink-http-error.js';
import type {
  CompleteTaskError,
  CreateNamedListError,
  CreateTaskError,
  DeleteNamedListError,
  DeleteTaskError,
  ListNamedListsError,
  ListOpenTasksOnListError,
  ListTasksError,
  ListUnlistedOpenTasksError,
  RenameNamedListError,
  ReorderOpenTasksError,
  TaskNotOpenField,
  UncompleteTaskError,
  UpdateTaskError,
} from '../../modules/task-management/index.js';

/**
 * Copied from the public-api list and task maps so this edge does not import
 * that edge. Statuses and bodies stay the same. Pin, get, and history stay
 * on the alias.
 */

const invalidCursor = (error: { readonly message: string }) =>
  new ORPCError('INVALID_CURSOR', {
    message: error.message,
    cause: error,
  });

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

export const mapListNamedListsError = (error: ListNamedListsError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list lists', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list lists', _never);
    }
  }
};

export const mapCreateNamedListError = (error: CreateNamedListError) => {
  switch (error.type) {
    case 'INVALID_LIST_NAME':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        cause: error,
      });
    case 'DUPLICATE_LIST_NAME':
      return yoinkHttpError({
        code: 'CONFLICT',
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to create list', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to create list', _never);
    }
  }
};

export const mapRenameNamedListError = (error: RenameNamedListError) => {
  switch (error.type) {
    case 'INVALID_LIST_NAME':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        cause: error,
      });
    case 'DUPLICATE_LIST_NAME':
      return yoinkHttpError({
        code: 'CONFLICT',
        message: error.message,
        cause: error,
      });
    case 'LIST_NOT_FOUND':
      return yoinkHttpError({
        code: 'NOT_FOUND',
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to rename list', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to rename list', _never);
    }
  }
};

export const mapDeleteNamedListError = (error: DeleteNamedListError) => {
  switch (error.type) {
    case 'LIST_NOT_FOUND':
      return yoinkHttpError({
        code: 'NOT_FOUND',
        message: error.message,
        cause: error,
      });
    case 'LIST_HAS_OPEN_TASKS':
      return yoinkHttpError({
        code: 'CONFLICT',
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to delete list', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to delete list', _never);
    }
  }
};

export const mapListOpenTasksError = (error: ListOpenTasksOnListError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'LIST_NOT_FOUND':
      return yoinkHttpError({
        code: 'NOT_FOUND',
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list open tasks', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list open tasks', _never);
    }
  }
};

export const mapReorderOpenTasksError = (error: ReorderOpenTasksError) => {
  switch (error.type) {
    case 'LIST_NOT_FOUND':
      return yoinkHttpError({
        code: 'NOT_FOUND',
        message: error.message,
        cause: error,
      });
    case 'TASK_NOT_OPEN':
    case 'INVALID_OPEN_ORDER':
      return yoinkHttpError({
        code: 'CONFLICT',
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to reorder open tasks', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to reorder open tasks', _never);
    }
  }
};

export const mapListUnlistedOpenTasksError = (error: ListUnlistedOpenTasksError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list unlisted tasks', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list unlisted tasks', _never);
    }
  }
};

export const mapReorderUnlistedOpenTasksError = (error: ReorderOpenTasksError) => {
  switch (error.type) {
    case 'TASK_NOT_OPEN':
    case 'INVALID_OPEN_ORDER':
      return yoinkHttpError({
        code: 'CONFLICT',
        message: error.message,
        cause: error,
      });
    case 'LIST_NOT_FOUND':
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to reorder unlisted tasks', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to reorder unlisted tasks', _never);
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
