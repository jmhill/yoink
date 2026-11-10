import { ORPCError } from '@orpc/server';
import { yoinkServerError } from '../_shared/orpc/yoink-http-error.js';
import type { ListNowError, ListWorkListsError } from '../../modules/task-management/index.js';

/**
 * Copied from the public-api work maps so this edge does not import that
 * edge. Statuses and bodies stay the same. `/api/work/*` and `/api/v1/work/*`
 * stay mounted.
 */

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
