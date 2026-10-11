import { errAsync, type ResultAsync } from 'neverthrow';
import type { HistoryPage } from '@yoink/api-contracts';
import type { InvalidCursorError } from '../../listing/domain/invalid-cursor.js';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { projectHistoryCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import {
  projectNotFoundError,
  type ProjectNotFoundError,
  type StorageError,
} from '../../projects/domain/project-errors.js';
import type { ChangeLogStorageError } from '../../shared/change-log/domain/history-page-item.js';
import type { ListProjectHistoryQuery } from '../domain/queries.js';
import { collectLookupIds, entriesFromHistoryPage } from './map-history-page.js';
import type {
  HistoryReadLogger,
  LoadProject,
  LoadTimelineLookups,
  PageProjectHistory,
} from './ports.js';

export type ListProjectHistoryError =
  | ProjectNotFoundError
  | InvalidCursorError
  | StorageError
  | ChangeLogStorageError;

export type HandleListProjectHistoryDeps = {
  load: LoadProject;
  pageProjectHistory: PageProjectHistory;
  loadLookups: LoadTimelineLookups;
  logger: HistoryReadLogger;
};

export const handleListProjectHistory = (
  query: ListProjectHistoryQuery,
  deps: HandleListProjectHistoryDeps
): ResultAsync<HistoryPage, ListProjectHistoryError> => {
  return deps.load(query.projectId).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== query.organizationId) {
      return errAsync(projectNotFoundError(query.projectId));
    }

    return runListedQuery({
      cursor: query.cursor,
      cursorOf: projectHistoryCursor,
      limit: resolveListLimit(query.limit, 'history'),
      load: (seek, fetchLimit) =>
        deps.pageProjectHistory({
          organizationId: query.organizationId,
          projectId: query.projectId,
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
