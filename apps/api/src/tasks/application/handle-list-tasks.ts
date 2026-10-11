import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ListTasksQuery } from '../domain/task-commands.js';
import { storageError, type ListTasksError } from '../domain/task-errors.js';
import { listKindForTaskFilter, resolveListLimit } from '../../listing/domain/list-kind.js';
import {
  asFinishedTask,
  completedTaskCursor,
  taskBoardCursor,
  type FinishedTask,
} from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import { resolveViewerToday } from '../../shared/domain/viewer-today.js';
import type { ListTasks } from './ports.js';

export type HandleListTasksDeps = {
  list: ListTasks;
  viewerNow: () => Date;
};

export const handleListTasks = (
  query: ListTasksQuery,
  deps: HandleListTasksDeps
): ResultAsync<ListedPage<Task>, ListTasksError> => {
  const limit = resolveListLimit(query.limit, listKindForTaskFilter(query.filter));
  const today = resolveViewerToday({
    now: deps.viewerNow(),
    timeZone: query.timeZone,
    today: query.today,
  });
  const completed = query.filter === 'completed';
  if (completed) {
    return runListedQuery({
      cursor: query.cursor,
      cursorOf: completedTaskCursor,
      limit,
      load: (seek, fetchLimit) =>
        deps
          .list({
            organizationId: query.organizationId,
            filter: query.filter,
            today,
            fetchLimit,
            seek,
            assigneeId: query.callerId,
          })
          .andThen((page) => {
            const rows: FinishedTask[] = [];
            for (const task of page.rows) {
              const finished = asFinishedTask(task);
              if (!finished) {
                return errAsync(
                  storageError('Completed task is missing completedAt', { taskId: task.id })
                );
              }
              rows.push(finished);
            }
            return okAsync({ ...page, rows });
          }),
    });
  }
  return runListedQuery({
    cursor: query.cursor,
    cursorOf: taskBoardCursor,
    limit,
    load: (seek, fetchLimit) =>
      deps.list({
        organizationId: query.organizationId,
        filter: query.filter,
        today,
        fetchLimit,
        seek,
        assigneeId: query.callerId,
      }),
  });
};
