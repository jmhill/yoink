import { errAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ListOpenTasksOnListQuery } from '../domain/list-queries.js';
import type { ListOpenTasksOnListError } from '../domain/list-errors.js';
import { listNotFoundError } from '../domain/list-errors.js';
import type { LoadNamedList, LoadOpenTasksOnList } from './ports.js';

export type HandleListOpenTasksDeps = {
  load: LoadNamedList;
  loadOpenTasksOnList: LoadOpenTasksOnList;
};

export const handleListOpenTasksOnList = (
  query: ListOpenTasksOnListQuery,
  deps: HandleListOpenTasksDeps
): ResultAsync<Task[], ListOpenTasksOnListError> => {
  return deps.load(query.listId).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== query.organizationId) {
      return errAsync(listNotFoundError(query.listId));
    }

    return deps.loadOpenTasksOnList(query.organizationId, query.listId);
  });
};
