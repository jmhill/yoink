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

export type ListNotFoundError = {
  readonly type: 'LIST_NOT_FOUND';
  readonly id: string;
  readonly message: string;
};

export type ListHasOpenTasksError = {
  readonly type: 'LIST_HAS_OPEN_TASKS';
  readonly id: string;
  readonly openTaskCount: number;
  readonly message: string;
};

export type ListNamedListsError = StorageError;
export type CreateNamedListError =
  | StorageError
  | InvalidListNameError
  | DuplicateListNameError;
export type DeleteNamedListError =
  | StorageError
  | ListNotFoundError
  | ListHasOpenTasksError;

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

export const listNotFoundError = (id: string): ListNotFoundError => ({
  type: 'LIST_NOT_FOUND',
  id,
  message: 'List not found',
});

export const listHasOpenTasksError = (
  id: string,
  openTaskCount: number
): ListHasOpenTasksError => ({
  type: 'LIST_HAS_OPEN_TASKS',
  id,
  openTaskCount,
  message: 'This list still has open tasks',
});
