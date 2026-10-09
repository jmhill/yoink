import { errAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ListOpenTasksOnListQuery } from '../domain/list-queries.js';
import type { ListOpenTasksOnListError } from '../domain/list-errors.js';
import { listNotFoundError } from '../domain/list-errors.js';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { openPileTaskCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import type { LoadNamedList, PageOpenTasksOnList } from './ports.js';

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
