import { ORPCError } from '@orpc/server';
import type {
  ListFinishedTasksOnProjectError,
  ListProjectHistoryError,
} from '../../modules/history/index.js';
import { yoinkHttpError, yoinkServerError } from '../_shared/orpc/yoink-http-error.js';

/**
 * Copied from the public-api project maps so this edge does not import that
 * edge. Statuses and bodies stay the same.
 */

type CodedError = {
  readonly type: string;
  readonly message: string;
};

type HttpStatus = 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT';

const httpError = (code: HttpStatus, error: CodedError) =>
  yoinkHttpError({
    code,
    message: error.message,
    bodyCode: error.type,
    cause: error,
  });

const invalidCursor = (error: { readonly message: string }) =>
  new ORPCError('INVALID_CURSOR', {
    message: error.message,
    cause: error,
  });

export const mapListProjectHistoryError = (error: ListProjectHistoryError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'PROJECT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list project history', error, 'STORAGE_ERROR');
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list project history', _never, 'STORAGE_ERROR');
    }
  }
};

export const mapListFinishedTasksError = (error: ListFinishedTasksOnProjectError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'PROJECT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list project tasks', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list project tasks', _never);
    }
  }
};
