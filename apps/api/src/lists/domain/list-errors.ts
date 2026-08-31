export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type InvalidListNameError = {
  readonly type: 'INVALID_LIST_NAME';
  readonly message: string;
};

export type ListNamedListsError = StorageError;
export type CreateNamedListError = StorageError | InvalidListNameError;

export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

export const invalidListNameError = (message: string): InvalidListNameError => ({
  type: 'INVALID_LIST_NAME',
  message,
});
