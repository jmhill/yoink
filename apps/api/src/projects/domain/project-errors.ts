import type { InvalidCursorError } from '../../listing/domain/invalid-cursor.js';
import type {
  InvalidNotebookPathError,
  NotebookPageDuplicateError,
  NotebookPagesTooManyError,
} from './notebook-pages.js';

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

export type ProjectProposeRequiresBotError = {
  readonly type: 'PROJECT_PROPOSE_REQUIRES_BOT';
  readonly message: string;
};

export type ProjectNotProposedError = {
  readonly type: 'PROJECT_NOT_PROPOSED';
  readonly id: string;
  readonly message: string;
};

export type ProjectNotDeclinedError = {
  readonly type: 'PROJECT_NOT_DECLINED';
  readonly id: string;
  readonly message: string;
};

export type ProjectConfirmRequiresPersonError = {
  readonly type: 'PROJECT_CONFIRM_REQUIRES_PERSON';
  readonly message: string;
};

export type ProjectDeclineRequiresPersonError = {
  readonly type: 'PROJECT_DECLINE_REQUIRES_PERSON';
  readonly message: string;
};

export type ProjectRestoreRequiresPersonError = {
  readonly type: 'PROJECT_RESTORE_REQUIRES_PERSON';
  readonly message: string;
};

export type InvalidProjectReasonError = {
  readonly type: 'INVALID_PROJECT_REASON';
  readonly message: string;
};

export type InvalidSuggestedNextActionError = {
  readonly type: 'INVALID_SUGGESTED_NEXT_ACTION';
  readonly message: string;
};

export type ProjectProposedError = {
  readonly type: 'PROJECT_PROPOSED';
  readonly id: string;
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

export type TaskNotFoundError = {
  readonly type: 'TASK_NOT_FOUND';
  readonly id: string;
  readonly message: string;
};

export type TaskNotOpenError = {
  readonly type: 'TASK_NOT_OPEN';
  readonly id: string;
  readonly message: string;
};

export type TaskNotInProjectError = {
  readonly type: 'TASK_NOT_IN_PROJECT';
  readonly taskId: string;
  readonly projectId: string;
  readonly message: string;
};

export type ProjectDoneError = {
  readonly type: 'PROJECT_DONE';
  readonly id: string;
  readonly message: string;
};

export type TaskTitleBlankError = {
  readonly type: 'TASK_TITLE_BLANK';
  readonly message: string;
};

export type TaskTitleTooLongError = {
  readonly type: 'TASK_TITLE_TOO_LONG';
  readonly message: string;
};

export type ListNotInOrganizationError = {
  readonly type: 'LIST_NOT_IN_ORGANIZATION';
  readonly listId: string;
  readonly organizationId: string;
  readonly message: string;
};

export type AssigneeNotInOrganizationError = {
  readonly type: 'ASSIGNEE_NOT_IN_ORGANIZATION';
  readonly assigneeId: string;
  readonly organizationId: string;
  readonly message: string;
};

export type ImportEntryError = {
  readonly index: number;
  readonly name: string;
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly taskTitle?: string;
};

export type ImportRequiresPersonError = {
  readonly type: 'IMPORT_REQUIRES_PERSON';
  readonly message: string;
};

export type ImportNotPendingError = {
  readonly type: 'IMPORT_NOT_PENDING';
  readonly message: string;
};

export type ImportNotFoundError = {
  readonly type: 'IMPORT_NOT_FOUND';
  readonly id: string;
  readonly message: string;
};

export type ImportInvalidError = {
  readonly type: 'IMPORT_INVALID';
  readonly message: string;
  readonly errors: readonly ImportEntryError[];
};

export type ListProjectsError = StorageError | InvalidCursorError | InvalidProjectStatusError;
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
  | ProjectCreateRequiresPersonError
  | ProjectProposeRequiresBotError
  | InvalidProjectStatusError
  | InvalidProjectReasonError
  | InvalidSuggestedNextActionError;
export type UpdateProjectError =
  | StorageError
  | InvalidProjectNameError
  | ProjectNameBlankError
  | DuplicateProjectNameError
  | ProjectNotFoundError
  | InvalidNotebookPathError
  | NotebookPageDuplicateError
  | NotebookPagesTooManyError
  | InvalidProjectReasonError
  | InvalidSuggestedNextActionError;
export type StageImportError = StorageError | ImportInvalidError;
export type ListImportsError = StorageError;
export type GetImportError = StorageError | ImportNotFoundError;
export type ApplyImportError =
  | StorageError
  | ImportNotFoundError
  | ImportRequiresPersonError
  | ImportNotPendingError
  | ImportInvalidError
  | DuplicateProjectNameError;
export type DiscardImportError =
  | StorageError
  | ImportNotFoundError
  | ImportRequiresPersonError
  | ImportNotPendingError;
export type ChangeProjectStatusError =
  | StorageError
  | ProjectNotFoundError
  | InvalidProjectStatusError
  | ProjectNotProposedError
  | ProjectWaitingOnRequiredError
  | ProjectWaitingOnBlankError
  | ProjectWaitingOnTooLongError
  | InvalidWaitingSinceError
  | ProjectDoneRequiresPersonError
  | ProjectReopenRequiresPersonError
  | ProjectHasOpenTasksError
  | OpenTasksUnreadError
  | OpenTaskPlanFailedError;

export type ConfirmProposedProjectError =
  | StorageError
  | ProjectNotFoundError
  | ProjectNotProposedError
  | ProjectConfirmRequiresPersonError
  | InvalidProjectNameError
  | ProjectNameBlankError
  | DuplicateProjectNameError
  | InvalidProjectStatusError
  | ProjectWaitingOnRequiredError
  | ProjectWaitingOnBlankError
  | ProjectWaitingOnTooLongError
  | InvalidWaitingSinceError
  | InvalidSuggestedNextActionError
  | TaskTitleBlankError
  | TaskTitleTooLongError
  | ListNotInOrganizationError
  | AssigneeNotInOrganizationError
  | OpenTaskPlanFailedError
  | ProjectDoneError
  | ProjectProposedError
  | TaskNotFoundError
  | TaskNotOpenError
  | TaskNotInProjectError;

export type DeclineProposedProjectError =
  | StorageError
  | ProjectNotFoundError
  | ProjectNotProposedError
  | ProjectDeclineRequiresPersonError;

export type RestoreDeclinedProjectError =
  | StorageError
  | ProjectNotFoundError
  | ProjectNotDeclinedError
  | ProjectRestoreRequiresPersonError
  | DuplicateProjectNameError;
export type SetProjectNextActionError =
  | StorageError
  | ProjectNotFoundError
  | TaskNotFoundError
  | TaskNotOpenError
  | TaskNotInProjectError
  | ProjectDoneError
  | ProjectProposedError
  | TaskTitleBlankError
  | TaskTitleTooLongError
  | ListNotInOrganizationError
  | AssigneeNotInOrganizationError
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

export const projectProposeRequiresBotError = (): ProjectProposeRequiresBotError => ({
  type: 'PROJECT_PROPOSE_REQUIRES_BOT',
  message: 'Only a bot can propose a project',
});

export const projectNotProposedError = (id: string): ProjectNotProposedError => ({
  type: 'PROJECT_NOT_PROPOSED',
  id,
  message: 'This project is not a pending proposal',
});

export const projectNotDeclinedError = (id: string): ProjectNotDeclinedError => ({
  type: 'PROJECT_NOT_DECLINED',
  id,
  message: 'This project is not a declined proposal',
});

export const projectConfirmRequiresPersonError = (): ProjectConfirmRequiresPersonError => ({
  type: 'PROJECT_CONFIRM_REQUIRES_PERSON',
  message: 'Confirming a proposal requires a person',
});

export const projectDeclineRequiresPersonError = (): ProjectDeclineRequiresPersonError => ({
  type: 'PROJECT_DECLINE_REQUIRES_PERSON',
  message: 'Turning down a proposal requires a person',
});

export const projectRestoreRequiresPersonError = (): ProjectRestoreRequiresPersonError => ({
  type: 'PROJECT_RESTORE_REQUIRES_PERSON',
  message: 'Restoring a proposal requires a person',
});

export const invalidProjectReasonError = (): InvalidProjectReasonError => ({
  type: 'INVALID_PROJECT_REASON',
  message: 'Reason must be 200 characters or fewer',
});

export const invalidSuggestedNextActionError = (): InvalidSuggestedNextActionError => ({
  type: 'INVALID_SUGGESTED_NEXT_ACTION',
  message: 'Suggested next action must be 500 characters or fewer',
});

export const projectProposedError = (id: string): ProjectProposedError => ({
  type: 'PROJECT_PROPOSED',
  id,
  message: 'A proposed project cannot have tasks',
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

export const taskNotFoundError = (id: string): TaskNotFoundError => ({
  type: 'TASK_NOT_FOUND',
  id,
  message: 'Task not found',
});

export const taskNotOpenError = (id: string): TaskNotOpenError => ({
  type: 'TASK_NOT_OPEN',
  id,
  message: 'Only an open task can be the next action',
});

export const taskNotInProjectError = (
  taskId: string,
  projectId: string
): TaskNotInProjectError => ({
  type: 'TASK_NOT_IN_PROJECT',
  taskId,
  projectId,
  message: 'That task is not in this project',
});

export const projectDoneError = (id: string): ProjectDoneError => ({
  type: 'PROJECT_DONE',
  id,
  message: 'A done project cannot have a next action',
});

export const taskTitleBlankError = (): TaskTitleBlankError => ({
  type: 'TASK_TITLE_BLANK',
  message: "Title can't be blank",
});

export const taskTitleTooLongError = (): TaskTitleTooLongError => ({
  type: 'TASK_TITLE_TOO_LONG',
  message: 'Title must be 500 characters or fewer',
});

export const listNotInOrganizationError = (
  listId: string,
  organizationId: string
): ListNotInOrganizationError => ({
  type: 'LIST_NOT_IN_ORGANIZATION',
  listId,
  organizationId,
  message: 'List is not in this organization',
});

export const assigneeNotInOrganizationError = (
  assigneeId: string,
  organizationId: string
): AssigneeNotInOrganizationError => ({
  type: 'ASSIGNEE_NOT_IN_ORGANIZATION',
  assigneeId,
  organizationId,
  message: 'Assignee is not a member of this organization',
});

export const importRequiresPersonError = (): ImportRequiresPersonError => ({
  type: 'IMPORT_REQUIRES_PERSON',
  message: 'Applying or discarding an import requires a person',
});

export const importNotPendingError = (): ImportNotPendingError => ({
  type: 'IMPORT_NOT_PENDING',
  message: 'This import is no longer pending',
});

export const importNotFoundError = (id: string): ImportNotFoundError => ({
  type: 'IMPORT_NOT_FOUND',
  id,
  message: 'Import not found',
});

export const importInvalidError = (errors: readonly ImportEntryError[]): ImportInvalidError => ({
  type: 'IMPORT_INVALID',
  message: 'The import batch is invalid',
  errors,
});
