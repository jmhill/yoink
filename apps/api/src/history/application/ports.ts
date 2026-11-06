import type { ResultAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import type { HistoryReadLogger } from '../../kernel/history-read-logger.js';
import type { KeysetCursor } from '../../kernel/listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../kernel/listing/domain/listed-page.js';
import type {
  ChangeLogStorageError,
  HistoryPageItem,
} from '../../shared/change-log/domain/history-page-item.js';
import type { StorageError } from '../../projects/domain/project-errors.js';
import type { TimelineLookups } from '../../shared/change-log/domain/to-timeline-entry.js';

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

export type LoadTimelineLookups = (ids: {
  taskIds: readonly string[];
  userIds: readonly string[];
  projectIds: readonly string[];
  noteIds: readonly string[];
}) => ResultAsync<TimelineLookups, StorageError>;
