import type { ResultAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import type { HistoryReadLogger } from '../../../kernel/history-read-logger.js';
import type { KeysetCursor } from '../../../kernel/listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../../kernel/listing/domain/listed-page.js';
import type {
  ChangeLogStorageError,
  HistoryPageItem,
} from '../domain/history-page-item.js';
import type { StorageError } from '../../task-management/domain/messages/project-errors.js';
import type { TimelineLookups } from '../domain/to-timeline-entry.js';

export type { HistoryReadLogger };

export type LoadProject = (id: string) => ResultAsync<Project | null, StorageError>;

export type LoadTaskIncludingDeleted = (
  id: string
) => ResultAsync<Task | null, StorageError>;

export type PageProjectHistory = (options: {
  organizationId: string;
  projectId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
}) => ResultAsync<KeysetRows<HistoryPageItem>, ChangeLogStorageError>;

export type PageTaskHistory = (options: {
  organizationId: string;
  subjectId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
}) => ResultAsync<KeysetRows<HistoryPageItem>, ChangeLogStorageError>;

export type PageFinishedTasksInProject = (options: {
  organizationId: string;
  projectId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
  completedAfter?: string;
  completedBefore?: string;
}) => ResultAsync<KeysetRows<Task>, StorageError>;

/** Task title and soft-delete flag. Task Management owns the rest of the task. */
export type TaskSubject = {
  readonly id: string;
  readonly title: string;
  readonly deleted: boolean;
};

export type LoadTaskSubjects = (
  ids: readonly string[]
) => ResultAsync<readonly TaskSubject[], StorageError>;

/** Project name. Task Management owns the rest of the project. */
export type ProjectName = {
  readonly id: string;
  readonly name: string;
};

export type LoadProjectNames = (
  ids: readonly string[]
) => ResultAsync<readonly ProjectName[], StorageError>;

/** Note title and soft-delete flag. Notes owns the rest of the note. */
export type NoteSubject = {
  readonly id: string;
  readonly title: string;
  readonly deleted: boolean;
};

export type LoadNoteSubjects = (
  ids: readonly string[]
) => ResultAsync<readonly NoteSubject[], StorageError>;

/** Actor display name. Access owns the user. */
export type ActorName = {
  readonly id: string;
  readonly name: string;
};

export type LoadActorNames = (
  ids: readonly string[]
) => ResultAsync<readonly ActorName[], StorageError>;

export type LoadTimelineLookups = (ids: {
  taskIds: readonly string[];
  userIds: readonly string[];
  projectIds: readonly string[];
  noteIds: readonly string[];
}) => ResultAsync<TimelineLookups, StorageError>;
