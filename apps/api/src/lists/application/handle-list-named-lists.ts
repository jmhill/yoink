import type { ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { ListNamedListsQuery } from '../domain/list-queries.js';
import type { ListNamedListsError } from '../domain/list-errors.js';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { namedListCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import type { PageNamedLists } from './ports.js';

export type HandleListNamedListsDeps = {
  pageNamedLists: PageNamedLists;
};

export const handleListNamedLists = (
  query: ListNamedListsQuery,
  deps: HandleListNamedListsDeps
): ResultAsync<ListedPage<NamedList>, ListNamedListsError> => {
  return runListedQuery({
    cursor: query.cursor,
    cursorOf: namedListCursor,
    limit: resolveListLimit(query.limit, 'pile'),
    load: (seek, fetchLimit) =>
      deps.pageNamedLists({
        organizationId: query.organizationId,
        fetchLimit,
        seek,
      }),
  });
};
