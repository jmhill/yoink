import type { ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ListUnlistedOpenTasksQuery } from '../domain/list-queries.js';
import type { ListUnlistedOpenTasksError } from '../domain/list-errors.js';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { openPileTaskCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import type { PageOpenTasksOnList } from './ports.js';

export type HandleListUnlistedOpenTasksDeps = {
  pageOpenTasksOnList: PageOpenTasksOnList;
};

export const handleListUnlistedOpenTasks = (
  query: ListUnlistedOpenTasksQuery,
  deps: HandleListUnlistedOpenTasksDeps
): ResultAsync<ListedPage<Task>, ListUnlistedOpenTasksError> => {
  return runListedQuery({
    cursor: query.cursor,
    cursorOf: openPileTaskCursor,
    limit: resolveListLimit(query.limit, 'pile'),
    load: (seek, fetchLimit) =>
      deps.pageOpenTasksOnList({
        organizationId: query.organizationId,
        listId: null,
        fetchLimit,
        seek,
      }),
  });
};
