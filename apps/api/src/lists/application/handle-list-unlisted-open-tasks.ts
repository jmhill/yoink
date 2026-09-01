import type { ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ListUnlistedOpenTasksQuery } from '../domain/list-queries.js';
import type { StorageError } from '../domain/list-errors.js';
import type { LoadOpenTasksOnList } from './ports.js';

export type HandleListUnlistedOpenTasksDeps = {
  loadOpenTasksOnList: LoadOpenTasksOnList;
};

export const handleListUnlistedOpenTasks = (
  query: ListUnlistedOpenTasksQuery,
  deps: HandleListUnlistedOpenTasksDeps
): ResultAsync<Task[], StorageError> => {
  return deps.loadOpenTasksOnList(query.organizationId, null);
};
