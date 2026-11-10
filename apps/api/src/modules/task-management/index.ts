// Commands, queries, and prepare are the published surface. The handler
// factories stay so existing callers and tests keep their ports.
export {
  createTaskManagement,
  type CreateTaskManagementDeps,
  type ProjectStarter,
  type TaskManagement,
  type TaskStarter,
} from './application/create-task-management.js';
export {
  createListHandlers,
  type ListHandlerDeps,
  type ListHandlers,
} from './application/create-list-handlers.js';
export {
  createProjectHandlers,
  type ProjectHandlerDeps,
  type ProjectHandlers,
} from './application/create-project-handlers.js';
export {
  createTaskHandlers,
  type TaskHandlerDeps,
  type TaskHandlers,
} from './application/create-task-handlers.js';
export {
  createWorkHandlers,
  type WorkHandlerDeps,
  type WorkHandlers,
} from './application/create-work-handlers.js';
export { createTaskService, type TaskService } from './domain/services/task-service.js';
export { storageError, type StorageError } from './domain/messages/storage-error.js';
export type { SetProjectNextActionCommand } from './domain/messages/project-commands.js';
export type {
  CompleteTaskError,
  CreateTaskError,
  DeleteTaskError,
  FindTaskError,
  ListTasksError,
  PinTaskError,
  TaskNotOpenField,
  UncompleteTaskError,
  UnpinTaskError,
  UpdateTaskError,
} from './domain/messages/task-errors.js';
export type {
  ApplyImportError,
  ChangeProjectStatusError,
  ConfirmProposedProjectError,
  CreateProjectError,
  DeclineProposedProjectError,
  DiscardImportError,
  GetImportError,
  GetProjectError,
  ImportEntryError,
  ImportInvalidError,
  ListImportsError,
  ListOpenTasksOnProjectError,
  ListProjectsError,
  OpenTasksUnreadError,
  ProjectHasOpenTasksError,
  RestoreDeclinedProjectError,
  SetProjectNextActionError,
  StageImportError,
  UpdateProjectError,
} from './domain/messages/project-errors.js';
export type {
  CreateNamedListError,
  DeleteNamedListError,
  ListNamedListsError,
  ListOpenTasksOnListError,
  ListUnlistedOpenTasksError,
  RenameNamedListError,
  ReorderOpenTasksError,
} from './domain/messages/list-errors.js';
export type { ListNowError, ListWorkListsError } from './domain/messages/work-errors.js';
