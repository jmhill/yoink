import type { ResultAsync } from 'neverthrow';
import type { NowNextActionItem } from '@yoink/api-contracts';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { workNextActionCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import type { ListNowNextActionsQuery } from '../domain/now-queries.js';
import type { ListNowError } from '../domain/work-errors.js';
import type { PageNowNextActions } from './ports.js';

export type HandleListNowNextActionsDeps = {
  pageNextActions: PageNowNextActions;
};

export const handleListNowNextActions = (
  query: ListNowNextActionsQuery,
  deps: HandleListNowNextActionsDeps
): ResultAsync<ListedPage<NowNextActionItem>, ListNowError> =>
  runListedQuery({
    cursor: query.cursor,
    cursorOf: workNextActionCursor,
    limit: resolveListLimit(query.limit, 'pile'),
    load: (seek, fetchLimit) =>
      deps.pageNextActions({
        organizationId: query.organizationId,
        owner: query.owner,
        callerId: query.callerId,
        fetchLimit,
        seek,
      }),
  });
