import { ORPCError } from '@orpc/server';
import type { ListDoneError, ListReviewError } from '../../../modules/review/index.js';
import { yoinkHttpError, yoinkServerError } from '../../_shared/orpc/yoink-http-error.js';

export const mapListReviewError = (error: ListReviewError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return new ORPCError('INVALID_CURSOR', {
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list review', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list review', _never);
    }
  }
};

export const mapListDoneError = (error: ListDoneError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return new ORPCError('INVALID_CURSOR', {
        message: error.message,
        cause: error,
      });
    case 'INVALID_WEEK':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: 'INVALID_WEEK',
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list done', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list done', _never);
    }
  }
};
