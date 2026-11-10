import type { NamedList } from '../../domain/model/named-list.js';
import type { ResultAsync } from 'neverthrow';

import type { ListNamedListsQuery } from '../../domain/messages/list-queries.js';
import type { ListNamedListsError } from '../../domain/messages/list-errors.js';
import { resolveListLimit } from '../../../../kernel/listing/domain/list-kind.js';
import { namedListCursor } from '../../../../kernel/listing/domain/list-keys.js';
import { runListedQuery } from '../../../../kernel/listing/application/run-listed-query.js';
import type { ListedPage } from '../../../../kernel/listing/domain/listed-page.js';
import type { PageNamedLists } from '../ports.js';

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
