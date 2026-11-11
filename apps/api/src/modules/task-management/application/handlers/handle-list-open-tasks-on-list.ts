import type { Task } from '../../domain/model/task.js';
import { errAsync, type ResultAsync } from 'neverthrow';

import type { ListOpenTasksOnListQuery } from '../../domain/messages/list-queries.js';
import type { ListOpenTasksOnListError } from '../../domain/messages/list-errors.js';
import { listNotFoundError } from '../../domain/messages/list-errors.js';
import { resolveListLimit } from '../../../../kernel/listing/domain/list-kind.js';
import { openPileTaskCursor } from '../../../../kernel/listing/domain/list-keys.js';
import { runListedQuery } from '../../../../kernel/listing/application/run-listed-query.js';
import type { ListedPage } from '../../../../kernel/listing/domain/listed-page.js';
import type { LoadNamedList, PageOpenTasksOnList } from '../ports.js';

export type HandleListOpenTasksDeps = {
  load: LoadNamedList;
  pageOpenTasksOnList: PageOpenTasksOnList;
};

export const handleListOpenTasksOnList = (
  query: ListOpenTasksOnListQuery,
  deps: HandleListOpenTasksDeps
): ResultAsync<ListedPage<Task>, ListOpenTasksOnListError> => {
  return deps.load(query.listId).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== query.organizationId) {
      return errAsync(listNotFoundError(query.listId));
    }

    return runListedQuery({
      cursor: query.cursor,
      cursorOf: openPileTaskCursor,
      limit: resolveListLimit(query.limit, 'pile'),
      load: (seek, fetchLimit) =>
        deps.pageOpenTasksOnList({
          organizationId: query.organizationId,
          listId: query.listId,
          fetchLimit,
          seek,
        }),
    });
  });
};
