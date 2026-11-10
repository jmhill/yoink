import type { ResultAsync } from 'neverthrow';
import type { ImportProject, NamedList, NowNextActionItem, Project, Task } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../../kernel/listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../../kernel/listing/domain/listed-page.js';
import type { WorkListCursorRow } from '../../../kernel/listing/domain/list-keys.js';
import type { StorageError } from '../domain/messages/storage-error.js';
import type { TaskNotFoundError } from '../domain/messages/task-errors.js';
import type {
  DuplicateProjectNameError,
  ImportNotPendingError,
  ProjectDoneError,
} from '../domain/messages/project-errors.js';
import type { FindByOrganizationOptions } from '../domain/messages/task-page.js';
import type { ListChangePlan } from '../domain/projections/plan-list-change.js';
import type { ProjectChangePlan } from '../domain/projections/plan-project-change.js';
import type { ImportWritePlan } from '../domain/projections/plan-project-import.js';
import type { TaskChangePlan } from '../domain/projections/plan-task-change.js';
import type { ProjectImportRecord } from '../domain/model/project-import.js';
import type {
  PageNowDueOptions,
  PageNowNextActionsOptions,
  PageWorkListsOptions,
} from '../domain/messages/work-page.js';

export type LoadTask = (id: string) => ResultAsync<Task | null, StorageError>;

export type LoadProject = (id: string) => ResultAsync<Project | null, StorageError>;

export type LoadNextOpenOrder = (
  organizationId: string,
  listId: string | null
) => ResultAsync<number, StorageError>;

export type LoadNamedList = (
  id: string
) => ResultAsync<NamedList | null, StorageError>;

/**
 * Project next-action creation reads only the list id and organization.
 * Tasks and lists load the whole named list through {@link LoadNamedList}.
 */
export type LoadListRef = (
  id: string
) => ResultAsync<{ id: string; organizationId: string } | null, StorageError>;

export type LoadTasksByIds = (
  ids: readonly string[]
) => ResultAsync<Task[], StorageError>;

export type LoadOpenTasksInPile = (
  organizationId: string,
  listId: string | null
) => ResultAsync<Task[], StorageError>;

export type LoadOpenTasksOnList = LoadOpenTasksInPile;

export type PersistTaskChange = (
  plan: TaskChangePlan,
  extras?: { project?: ProjectChangePlan }
) => ResultAsync<void, StorageError | TaskNotFoundError>;

export type ListTasks = (
  options: FindByOrganizationOptions
) => ResultAsync<KeysetRows<Task>, StorageError>;

export type ListProjects = (organizationId: string) => ResultAsync<Project[], StorageError>;

export type PageProjects = (options: {
  organizationId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
  statuses?: readonly Project['status'][];
  createdById?: string;
}) => ResultAsync<KeysetRows<Project>, StorageError>;

export type PersistProjectChange = (
  plan: ProjectChangePlan
) => ResultAsync<void, StorageError | DuplicateProjectNameError>;

export type PageOpenTasksOnProject = (options: {
  organizationId: string;
  projectId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
}) => ResultAsync<KeysetRows<Task>, StorageError>;

export type PersistProjectStatusChange = (input: {
  project: ProjectChangePlan;
  tasks: readonly TaskChangePlan[];
}) => ResultAsync<void, StorageError>;

export type PersistSetNextAction = (input: {
  project: ProjectChangePlan;
  tasks: readonly TaskChangePlan[];
}) => ResultAsync<void, StorageError | ProjectDoneError>;

export type LoadListsByIds = (
  ids: readonly string[]
) => ResultAsync<Array<{ id: string; organizationId: string }>, StorageError>;

export type LoadMemberIds = (
  organizationId: string
) => ResultAsync<ReadonlySet<string>, StorageError>;

export type LoadUserName = (userId: string) => ResultAsync<string, StorageError>;

export type PersistStagedImport = (
  record: ProjectImportRecord
) => ResultAsync<void, StorageError>;

export type LoadStagedImport = (
  id: string
) => ResultAsync<ProjectImportRecord | null, StorageError>;

export type ListPendingImports = (
  organizationId: string
) => ResultAsync<ProjectImportRecord[], StorageError>;

export type PersistImportApply = (input: {
  write: ImportWritePlan;
  stagedImportId: string;
  decidedById: string;
  decidedAt: string;
}) => ResultAsync<void, StorageError | DuplicateProjectNameError | ImportNotPendingError>;

export type PersistImportDiscard = (input: {
  id: string;
  organizationId: string;
  decidedById: string;
  decidedAt: string;
}) => ResultAsync<void, StorageError | ImportNotPendingError>;

export type { ImportProject };

export type ListNamedLists = (
  organizationId: string
) => ResultAsync<NamedList[], StorageError>;

export type PageNamedLists = (options: {
  organizationId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
}) => ResultAsync<KeysetRows<NamedList>, StorageError>;

export type CountOpenTasksOnList = (
  listId: string
) => ResultAsync<number, StorageError>;

export type PersistNamedListChange = (
  plan: ListChangePlan
) => ResultAsync<void, StorageError>;

export type PageOpenTasksOnList = (options: {
  organizationId: string;
  listId: string | null;
  fetchLimit: number;
  seek?: KeysetCursor;
}) => ResultAsync<KeysetRows<Task>, StorageError>;

export type PageNowNextActions = (
  options: PageNowNextActionsOptions
) => ResultAsync<KeysetRows<NowNextActionItem>, StorageError>;

export type PageNowDue = (
  options: PageNowDueOptions
) => ResultAsync<KeysetRows<Task>, StorageError>;

export type PageWorkLists = (
  options: PageWorkListsOptions
) => ResultAsync<KeysetRows<WorkListCursorRow>, StorageError>;

export type CountUnlistedOpen = (
  organizationId: string
) => ResultAsync<number, StorageError>;
