export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type TaskNotFoundError = {
  readonly type: 'TASK_NOT_FOUND';
  readonly taskId: string;
};

// Composite error types for each operation
export type CreateTaskError = StorageError;
export type ListTasksError = StorageError;
export type FindTaskError = StorageError | TaskNotFoundError;
export type UpdateTaskError = StorageError | TaskNotFoundError;
export type CompleteTaskError = StorageError | TaskNotFoundError;
export type UncompleteTaskError = StorageError | TaskNotFoundError;
export type PinTaskError = StorageError | TaskNotFoundError;
export type UnpinTaskError = StorageError | TaskNotFoundError;
export type DeleteTaskError = StorageError | TaskNotFoundError;

// Error constructors
export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

export const taskNotFoundError = (taskId: string): TaskNotFoundError => ({
  type: 'TASK_NOT_FOUND',
  taskId,
});
