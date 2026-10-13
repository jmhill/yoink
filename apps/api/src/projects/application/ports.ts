import type { ResultAsync } from 'neverthrow';
import type { ImportProject, Project, Task } from '@yoink/api-contracts';
import type {
  DuplicateProjectNameError,
  ImportNotPendingError,
  ProjectDoneError,
  StorageError,
} from '../domain/project-errors.js';
import type { ProjectChangePlan } from '../domain/plan-project-change.js';
import type { ImportWritePlan } from '../domain/plan-project-import.js';
import type { ProjectImportRecord } from '../domain/project-import.js';
import type { TaskChangePlan } from '../../tasks/domain/plan-task-change.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';

export type ListProjects = (organizationId: string) => ResultAsync<Project[], StorageError>;

export type PageProjects = (options: {
  organizationId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
  statuses?: readonly Project['status'][];
  createdById?: string;
}) => ResultAsync<KeysetRows<Project>, StorageError>;

export type LoadProject = (id: string) => ResultAsync<Project | null, StorageError>;

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

export type LoadTask = (id: string) => ResultAsync<Task | null, StorageError>;

export type LoadNamedList = (
  id: string
) => ResultAsync<{ id: string; organizationId: string } | null, StorageError>;

export type LoadNextOpenOrder = (
  organizationId: string,
  listId: string | null
) => ResultAsync<number, StorageError>;

export type LoadTasksByIds = (ids: readonly string[]) => ResultAsync<Task[], StorageError>;

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
