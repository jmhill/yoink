import type { ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { ListCapturesQuery } from '../domain/capture-commands.js';
import type { ListCapturesError } from '../domain/capture-errors.js';
import { listKindForCaptureList, resolveListLimit } from '../../listing/domain/list-kind.js';
import {
  captureFeedCursor,
  snoozedCaptureCursor,
} from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import type { ListCaptures } from './ports.js';

export type HandleListCapturesDeps = {
  list: ListCaptures;
  now: () => string;
};

export const handleListCaptures = (
  query: ListCapturesQuery,
  deps: HandleListCapturesDeps
): ResultAsync<ListedPage<Capture>, ListCapturesError> => {
  const limit = resolveListLimit(query.limit, listKindForCaptureList(query.status));
  const snoozed = query.snoozed === true;
  return runListedQuery({
    cursor: query.cursor,
    cursorOf: snoozed ? snoozedCaptureCursor : captureFeedCursor,
    limit,
    load: (seek, fetchLimit) =>
      deps.list({
        organizationId: query.organizationId,
        status: query.status,
        snoozed: query.snoozed,
        now: deps.now(),
        fetchLimit,
        seek,
      }),
  });
};
