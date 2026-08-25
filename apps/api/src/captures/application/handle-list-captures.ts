import type { ResultAsync } from 'neverthrow';
import type { ListCapturesQuery } from '../domain/capture-commands.js';
import type { ListCapturesError } from '../domain/capture-errors.js';
import type { FindByOrganizationResult } from '../domain/capture-store.js';
import type { ListCaptures } from './ports.js';

export type HandleListCapturesDeps = {
  list: ListCaptures;
  now: () => string;
};

export const handleListCaptures = (
  query: ListCapturesQuery,
  deps: HandleListCapturesDeps
): ResultAsync<FindByOrganizationResult, ListCapturesError> => {
  return deps.list({
    organizationId: query.organizationId,
    status: query.status,
    snoozed: query.snoozed,
    now: deps.now(),
    limit: query.limit,
    cursor: query.cursor,
  });
};
