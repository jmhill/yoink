import type { ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { workDueCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import { resolveViewerToday } from '../../shared/domain/viewer-today.js';
import type { ListNowDueQuery } from '../domain/now-queries.js';
import type { ListNowError } from '../domain/work-errors.js';
import type { PageNowDue } from './ports.js';

export type HandleListNowDueDeps = {
  pageDue: PageNowDue;
  now: () => Date;
};

export const handleListNowDue = (
  query: ListNowDueQuery,
  deps: HandleListNowDueDeps
): ResultAsync<ListedPage<Task>, ListNowError> => {
  const today = resolveViewerToday({
    now: deps.now(),
    timeZone: query.timeZone,
    today: query.today,
  });
  return runListedQuery({
    cursor: query.cursor,
    cursorOf: workDueCursor,
    limit: resolveListLimit(query.limit, 'pile'),
    load: (seek, fetchLimit) =>
      deps.pageDue({
        organizationId: query.organizationId,
        owner: query.owner,
        callerId: query.callerId,
        today,
        fetchLimit,
        seek,
      }),
  });
};
