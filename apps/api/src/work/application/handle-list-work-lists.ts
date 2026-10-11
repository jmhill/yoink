import type { ResultAsync } from 'neverthrow';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { workListCursor, type WorkListCursorRow } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import type { ListWorkListsQuery } from '../domain/now-queries.js';
import type { ListWorkListsError } from '../domain/work-errors.js';
import type { PageWorkLists } from './ports.js';

export type WorkListsResult = ListedPage<WorkListCursorRow> & {
  unlisted: { openTaskCount: number };
};

export type HandleListWorkListsDeps = {
  pageLists: PageWorkLists;
};

export const handleListWorkLists = (
  query: ListWorkListsQuery,
  deps: HandleListWorkListsDeps
): ResultAsync<WorkListsResult, ListWorkListsError> => {
  let unlistedOpenCount = 0;
  return runListedQuery({
    cursor: query.cursor,
    cursorOf: workListCursor,
    limit: resolveListLimit(query.limit, 'pile'),
    load: (seek, fetchLimit) =>
      deps.pageLists({
        organizationId: query.organizationId,
        fetchLimit,
        seek,
      }).map((page) => {
        unlistedOpenCount = page.unlistedOpenCount;
        return page.lists;
      }),
  }).map((page) => ({
    ...page,
    unlisted: { openTaskCount: unlistedOpenCount },
  }));
};
