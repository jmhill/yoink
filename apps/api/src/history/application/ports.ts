import type { ResultAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type {
  ChangeLogStorageError,
  HistoryPageItem,
} from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';
import type { StorageError } from '../../projects/domain/project-errors.js';
import type { TimelineLookups } from '../../shared/change-log/domain/to-timeline-entry.js';

export type HistoryReadLogger = {
  warn: (fields: { recordId: string; kind: string; reason: string }) => void;
};

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
}) => ResultAsync<TimelineLookups, StorageError>;
