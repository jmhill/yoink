import type { InvalidCursorError } from '../../listing/domain/invalid-cursor.js';

export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type InvalidProjectNameError = {
  readonly type: 'INVALID_PROJECT_NAME';
  readonly message: string;
};

export type ProjectNameBlankError = {
  readonly type: 'PROJECT_NAME_BLANK';
  readonly message: string;
};

export type DuplicateProjectNameError = {
  readonly type: 'DUPLICATE_PROJECT_NAME';
  readonly name: string;
  readonly message: string;
};

export type ProjectNotFoundError = {
  readonly type: 'PROJECT_NOT_FOUND';
  readonly id: string;
  readonly message: string;
};

export type ProjectCreateRequiresPersonError = {
  readonly type: 'PROJECT_CREATE_REQUIRES_PERSON';
  readonly message: string;
};

export type InvalidProjectStatusError = {
  readonly type: 'INVALID_PROJECT_STATUS';
  readonly message: string;
};

export type ProjectWaitingOnRequiredError = {
  readonly type: 'PROJECT_WAITING_ON_REQUIRED';
  readonly message: string;
};

export type ProjectWaitingOnBlankError = {
  readonly type: 'PROJECT_WAITING_ON_BLANK';
  readonly message: string;
};

export type ProjectWaitingOnTooLongError = {
  readonly type: 'PROJECT_WAITING_ON_TOO_LONG';
  readonly message: string;
};

export type InvalidWaitingSinceError = {
  readonly type: 'INVALID_WAITING_SINCE';
  readonly message: string;
};

export type ProjectDoneRequiresPersonError = {
  readonly type: 'PROJECT_DONE_REQUIRES_PERSON';
  readonly message: string;
};

export type ProjectReopenRequiresPersonError = {
  readonly type: 'PROJECT_REOPEN_REQUIRES_PERSON';
  readonly message: string;
};

export type ProjectHasOpenTasksError = {
  readonly type: 'PROJECT_HAS_OPEN_TASKS';
  readonly openTaskCount: number;
  readonly message: string;
};

export type OpenTasksUnreadError = {
  readonly type: 'OPEN_TASKS_UNREAD';
  readonly openTaskCount: number;
  readonly readCount: number;
  readonly message: string;
};

export type OpenTaskPlanFailedError = {
  readonly type: 'OPEN_TASK_PLAN_FAILED';
  readonly taskId: string;
  readonly message: string;
  readonly cause?: unknown;
};

export type ListProjectsError = StorageError | InvalidCursorError;
export type GetProjectError = StorageError | ProjectNotFoundError;
export type ListOpenTasksOnProjectError =
  | StorageError
  | ProjectNotFoundError
  | InvalidCursorError;
export type CreateProjectError =
  | StorageError
  | InvalidProjectNameError
  | ProjectNameBlankError
  | DuplicateProjectNameError
  | ProjectCreateRequiresPersonError;
export type UpdateProjectError =
  | StorageError
  | InvalidProjectNameError
  | ProjectNameBlankError
  | DuplicateProjectNameError
  | ProjectNotFoundError;
export type ChangeProjectStatusError =
  | StorageError
  | ProjectNotFoundError
  | InvalidProjectStatusError
  | ProjectWaitingOnRequiredError
  | ProjectWaitingOnBlankError
  | ProjectWaitingOnTooLongError
  | InvalidWaitingSinceError
  | ProjectDoneRequiresPersonError
  | ProjectReopenRequiresPersonError
  | ProjectHasOpenTasksError
  | OpenTasksUnreadError
  | OpenTaskPlanFailedError;

export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

export const invalidProjectNameError = (message: string): InvalidProjectNameError => ({
  type: 'INVALID_PROJECT_NAME',
  message,
});

export const projectNameBlankError = (): ProjectNameBlankError => ({
  type: 'PROJECT_NAME_BLANK',
  message: "Name can't be blank",
});

export const duplicateProjectNameError = (name: string): DuplicateProjectNameError => ({
  type: 'DUPLICATE_PROJECT_NAME',
  name,
  message: 'A project with this name already exists',
});

export const projectNotFoundError = (id: string): ProjectNotFoundError => ({
  type: 'PROJECT_NOT_FOUND',
  id,
  message: 'Project not found',
});

export const projectCreateRequiresPersonError = (): ProjectCreateRequiresPersonError => ({
  type: 'PROJECT_CREATE_REQUIRES_PERSON',
  message: 'Creating a project requires a person',
});

export const invalidProjectStatusError = (): InvalidProjectStatusError => ({
  type: 'INVALID_PROJECT_STATUS',
  message: 'Status must be active, waiting, someday, or done',
});

export const projectWaitingOnRequiredError = (): ProjectWaitingOnRequiredError => ({
  type: 'PROJECT_WAITING_ON_REQUIRED',
  message: 'Waiting on is required',
});

export const projectWaitingOnBlankError = (): ProjectWaitingOnBlankError => ({
  type: 'PROJECT_WAITING_ON_BLANK',
  message: "Waiting on can't be blank",
});

export const projectWaitingOnTooLongError = (): ProjectWaitingOnTooLongError => ({
  type: 'PROJECT_WAITING_ON_TOO_LONG',
  message: 'Waiting on must be 200 characters or fewer',
});

export const invalidWaitingSinceError = (): InvalidWaitingSinceError => ({
  type: 'INVALID_WAITING_SINCE',
  message: 'Waiting since must be a date (YYYY-MM-DD) or unknown',
});

export const projectDoneRequiresPersonError = (): ProjectDoneRequiresPersonError => ({
  type: 'PROJECT_DONE_REQUIRES_PERSON',
  message: 'Marking a project done requires a person',
});

export const projectReopenRequiresPersonError = (): ProjectReopenRequiresPersonError => ({
  type: 'PROJECT_REOPEN_REQUIRES_PERSON',
  message: 'Reopening a done project requires a person',
});

export const projectHasOpenTasksError = (openTaskCount: number): ProjectHasOpenTasksError => ({
  type: 'PROJECT_HAS_OPEN_TASKS',
  openTaskCount,
  message: `This project has ${openTaskCount} open task${openTaskCount === 1 ? '' : 's'}`,
});

export const openTasksUnreadError = (
  openTaskCount: number,
  readCount: number
): OpenTasksUnreadError => ({
  type: 'OPEN_TASKS_UNREAD',
  openTaskCount,
  readCount,
  message: `This project has ${openTaskCount} open task${openTaskCount === 1 ? '' : 's'} and only ${readCount} could be loaded`,
});

export const openTaskPlanFailedError = (
  taskId: string,
  cause?: unknown
): OpenTaskPlanFailedError => ({
  type: 'OPEN_TASK_PLAN_FAILED',
  taskId,
  message: 'Failed to plan an open-task change for this project',
  cause,
});
