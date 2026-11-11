import { errAsync, type ResultAsync } from 'neverthrow';
import type { HistoryPage } from '../domain/model/timeline-document.js';
import type { InvalidCursorError } from '../../../kernel/listing/domain/invalid-cursor.js';
import { resolveListLimit } from '../../../kernel/listing/domain/list-kind.js';
import { taskHistoryCursor } from '../../../kernel/listing/domain/list-keys.js';
import { runListedQuery } from '../../../kernel/listing/application/run-listed-query.js';
import { taskNotFoundError, type TaskNotFoundError } from '../../task-management/domain/messages/task-errors.js';
import type { StorageError } from '../../task-management/domain/messages/project-errors.js';
import type { ChangeLogStorageError } from '../domain/history-page-item.js';
import type { ListTaskHistoryQuery } from '../domain/queries.js';
import { collectLookupIds, entriesFromHistoryPage } from './map-history-page.js';
import type {
  HistoryReadLogger,
  LoadTaskIncludingDeleted,
  LoadTimelineLookups,
  PageTaskHistory,
} from './ports.js';

export type ListTaskHistoryError =
  | TaskNotFoundError
  | InvalidCursorError
  | StorageError
  | ChangeLogStorageError;

export type HandleListTaskHistoryDeps = {
  loadTaskIncludingDeleted: LoadTaskIncludingDeleted;
  pageTaskHistory: PageTaskHistory;
  loadLookups: LoadTimelineLookups;
  logger: HistoryReadLogger;
};

export const handleListTaskHistory = (
  query: ListTaskHistoryQuery,
  deps: HandleListTaskHistoryDeps
): ResultAsync<HistoryPage, ListTaskHistoryError> => {
  return deps.loadTaskIncludingDeleted(query.taskId).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== query.organizationId) {
      return errAsync(taskNotFoundError(query.taskId));
    }

    return runListedQuery({
      cursor: query.cursor,
      cursorOf: taskHistoryCursor,
      limit: resolveListLimit(query.limit, 'history'),
      load: (seek, fetchLimit) =>
        deps.pageTaskHistory({
          organizationId: query.organizationId,
          subjectId: query.taskId,
          fetchLimit,
          seek,
        }),
    }).andThen((page) =>
      deps.loadLookups(collectLookupIds(page.items)).map((lookups) =>
        entriesFromHistoryPage(page, lookups, deps.logger)
      )
    );
  });
};
