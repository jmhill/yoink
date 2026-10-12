import type { InvalidCursorError } from '../../listing/domain/invalid-cursor.js';

export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

export type InvalidWeekError = {
  readonly type: 'INVALID_WEEK';
  readonly message: string;
};

export const invalidWeekError = (message: string): InvalidWeekError => ({
  type: 'INVALID_WEEK',
  message,
});

export type ListReviewError = StorageError | InvalidCursorError;

export type ListDoneError = StorageError | InvalidCursorError | InvalidWeekError;
