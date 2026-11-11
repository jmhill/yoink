import type { Task } from '../../domain/model/task.js';
import type { ResultAsync } from 'neverthrow';

import type { ListUnlistedOpenTasksQuery } from '../../domain/messages/list-queries.js';
import type { ListUnlistedOpenTasksError } from '../../domain/messages/list-errors.js';
import { resolveListLimit } from '../../../../kernel/listing/domain/list-kind.js';
import { openPileTaskCursor } from '../../../../kernel/listing/domain/list-keys.js';
import { runListedQuery } from '../../../../kernel/listing/application/run-listed-query.js';
import type { ListedPage } from '../../../../kernel/listing/domain/listed-page.js';
import type { PageOpenTasksOnList } from '../ports.js';

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
