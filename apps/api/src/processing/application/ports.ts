import type { ResultAsync } from 'neverthrow';
import type { Capture, NamedList, Project } from '@yoink/api-contracts';
import type {
  CaptureNotInInboxError,
  StorageError as CaptureStorageError,
} from '../../captures/domain/capture-errors.js';
import type {
  DuplicateProjectNameError,
  StorageError as ProjectStorageError,
} from '../../projects/domain/project-errors.js';
import type { ProjectChangePlan } from '../../projects/domain/plan-project-change.js';
import type { TaskChangePlan } from '../../tasks/domain/plan-task-change.js';

export type LoadCapture = (
  id: string
) => ResultAsync<Capture | null, CaptureStorageError>;

export type ListProjects = (
  organizationId: string
) => ResultAsync<Project[], ProjectStorageError>;

export type LoadNamedList = (
  id: string
) => ResultAsync<NamedList | null, CaptureStorageError | ProjectStorageError>;

export type LoadProject = (
  id: string
) => ResultAsync<Project | null, CaptureStorageError | ProjectStorageError>;

export type LoadNextOpenOrder = (
  organizationId: string,
  listId: string | null
) => ResultAsync<number, CaptureStorageError | ProjectStorageError>;

export type ProcessCaptureMark = {
  id: string;
  organizationId: string;
  processedAt: string;
  processedToType: 'task' | 'project';
  processedToId: string;
};

export type PersistProcessToProject = (input: {
  project: Extract<ProjectChangePlan, { action: 'insert' }>;
  capture: ProcessCaptureMark;
}) => ResultAsync<
  void,
  ProjectStorageError | DuplicateProjectNameError | CaptureNotInInboxError
>;

export type PersistProcessToTask = (input: {
  task: Extract<TaskChangePlan, { action: 'insert' }>;
  capture: ProcessCaptureMark;
}) => ResultAsync<void, CaptureStorageError | CaptureNotInInboxError>;
