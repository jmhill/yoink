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

export type ListNowError = StorageError | InvalidCursorError;
export type ListWorkListsError = StorageError | InvalidCursorError;
