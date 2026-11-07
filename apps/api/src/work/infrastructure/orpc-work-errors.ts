import { ORPCError } from '@orpc/server';
import { yoinkServerError } from '../../edges/_shared/orpc/yoink-http-error.js';
import type { ListNowError, ListWorkListsError } from '../domain/work-errors.js';

const mapCursorOrStorage = (
  error: ListNowError | ListWorkListsError,
  logMessage: string
) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return new ORPCError('INVALID_CURSOR', {
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError(logMessage, error);
    default: {
      const _never: never = error;
      return yoinkServerError(logMessage, _never);
    }
  }
};

export const mapListNextActionsError = (error: ListNowError) =>
  mapCursorOrStorage(error, 'Failed to list next actions');

export const mapListDueError = (error: ListNowError) =>
  mapCursorOrStorage(error, 'Failed to list due tasks');

export const mapListWorkListsError = (error: ListWorkListsError) =>
  mapCursorOrStorage(error, 'Failed to list work lists');
