import type { ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { ListNamedListsQuery } from '../domain/list-queries.js';
import type { ListNamedListsError } from '../domain/list-errors.js';
import type { ListNamedLists } from './ports.js';

export type HandleListNamedListsDeps = {
  list: ListNamedLists;
};

export const handleListNamedLists = (
  query: ListNamedListsQuery,
  deps: HandleListNamedListsDeps
): ResultAsync<NamedList[], ListNamedListsError> => {
  return deps.list(query.organizationId);
};
