import type { InvalidCursorError } from '../../listing/domain/invalid-cursor.js';

export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type TaskNotFoundError = {
  readonly type: 'TASK_NOT_FOUND';
  readonly taskId: string;
};

export type AssigneeNotInOrganizationError = {
  readonly type: 'ASSIGNEE_NOT_IN_ORGANIZATION';
  readonly assigneeId: string;
  readonly organizationId: string;
};

export type ListNotInOrganizationError = {
  readonly type: 'LIST_NOT_IN_ORGANIZATION';
  readonly listId: string;
  readonly organizationId: string;
};

export type TaskNotOpenField = 'list' | 'project';

export type TaskNotOpenError = {
  readonly type: 'TASK_NOT_OPEN';
  readonly taskId: string;
  readonly field: TaskNotOpenField;
};

export type ProjectNotInOrganizationError = {
  readonly type: 'PROJECT_NOT_IN_ORGANIZATION';
  readonly projectId: string;
  readonly organizationId: string;
};

export type ProjectDoneError = {
  readonly type: 'PROJECT_DONE';
  readonly projectId: string;
};

// Composite error types for each operation
export type CreateTaskError =
  | StorageError
  | AssigneeNotInOrganizationError
  | ListNotInOrganizationError
  | ProjectNotInOrganizationError
  | ProjectDoneError;
export type ListTasksError = StorageError | InvalidCursorError;
export type FindTaskError = StorageError | TaskNotFoundError;
export type UpdateTaskError =
  | StorageError
  | TaskNotFoundError
  | AssigneeNotInOrganizationError
  | ListNotInOrganizationError
  | ProjectNotInOrganizationError
  | ProjectDoneError
  | TaskNotOpenError;
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

export const assigneeNotInOrganizationError = (
  assigneeId: string,
  organizationId: string
): AssigneeNotInOrganizationError => ({
  type: 'ASSIGNEE_NOT_IN_ORGANIZATION',
  assigneeId,
  organizationId,
});

export const listNotInOrganizationError = (
  listId: string,
  organizationId: string
): ListNotInOrganizationError => ({
  type: 'LIST_NOT_IN_ORGANIZATION',
  listId,
  organizationId,
});

export const taskNotOpenError = (
  taskId: string,
  field: TaskNotOpenField
): TaskNotOpenError => ({
  type: 'TASK_NOT_OPEN',
  taskId,
  field,
});

export const projectNotInOrganizationError = (
  projectId: string,
  organizationId: string
): ProjectNotInOrganizationError => ({
  type: 'PROJECT_NOT_IN_ORGANIZATION',
  projectId,
  organizationId,
});

export const projectDoneError = (projectId: string): ProjectDoneError => ({
  type: 'PROJECT_DONE',
  projectId,
});
