export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type InvalidListNameError = {
  readonly type: 'INVALID_LIST_NAME';
  readonly message: string;
};

export type DuplicateListNameError = {
  readonly type: 'DUPLICATE_LIST_NAME';
  readonly name: string;
  readonly message: string;
};

export type ListNamedListsError = StorageError;
export type CreateNamedListError =
  | StorageError
  | InvalidListNameError
  | DuplicateListNameError;

export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

export const invalidListNameError = (message: string): InvalidListNameError => ({
  type: 'INVALID_LIST_NAME',
  message,
});

export const duplicateListNameError = (name: string): DuplicateListNameError => ({
  type: 'DUPLICATE_LIST_NAME',
  name,
  message: 'A list with this name already exists',
});
