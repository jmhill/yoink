import type { ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ListTasksQuery } from '../domain/task-commands.js';
import type { ListTasksError } from '../domain/task-errors.js';
import { listKindForTaskFilter, resolveListLimit } from '../../listing/domain/list-kind.js';
import { completedTaskCursor, taskBoardCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery, type ListedPage } from '../../listing/domain/listed-page.js';
import type { ListTasks } from './ports.js';

export type HandleListTasksDeps = {
  list: ListTasks;
  today: () => string;
};

export const handleListTasks = (
  query: ListTasksQuery,
  deps: HandleListTasksDeps
): ResultAsync<ListedPage<Task>, ListTasksError> => {
  const limit = resolveListLimit(query.limit, listKindForTaskFilter(query.filter));
  const cursorOf = query.filter === 'completed' ? completedTaskCursor : taskBoardCursor;
  return runListedQuery({
    cursor: query.cursor,
    limit,
    cursorOf,
    load: (seek, fetchLimit) =>
      deps.list({
        organizationId: query.organizationId,
        filter: query.filter,
        today: deps.today(),
        fetchLimit,
        seek,
        assigneeId: query.callerId,
      }),
  });
};
