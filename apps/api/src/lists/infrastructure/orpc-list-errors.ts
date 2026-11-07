import { ORPCError } from '@orpc/server';
import { yoinkHttpError, yoinkServerError } from '../../edges/_shared/orpc/yoink-http-error.js';
import type {
  CreateNamedListError,
  DeleteNamedListError,
  ListNamedListsError,
  ListOpenTasksOnListError,
  ListUnlistedOpenTasksError,
  RenameNamedListError,
  ReorderOpenTasksError,
} from '../domain/list-errors.js';

const invalidCursor = (error: { readonly message: string }) =>
  new ORPCError('INVALID_CURSOR', {
    message: error.message,
    cause: error,
  });

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
