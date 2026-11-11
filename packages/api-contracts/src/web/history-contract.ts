import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { HistoryPageSchema } from '../schemas/history.js';
import { ListPageQuerySchema, TaskListPageSchema } from '../schemas/list-page.js';

/**
 * Query values are JSON-parsed. Otherwise they stay strings, and
 * `z.coerce.boolean()` turns `"false"` into `true`.
 */
const historyQueryStyles = {
  limit: 'json',
  cursor: 'json',
} as const;

const projectId = z.object({
  id: z.string().uuid(),
});

/**
 * Project history and finished tasks. Paths are the resource after `/web-api`.
 * Finished tasks use `/finished` so they do not share the open-task route.
 * The same reads stay on `/api` and `/api/v1` at their current paths.
 * Done pages already use the tasks list. Trash stays on the captures alias.
 */
export const webHistoryContract = oc.router({
  listProjectHistory: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/projects/{id}/history',
        summary: "Read a project's visible change-log timeline, newest first",
        queryStyles: historyQueryStyles,
      })
    )
    .input(projectId.merge(ListPageQuerySchema))
    .output(HistoryPageSchema),
  listFinishedTasks: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/projects/{id}/finished',
        summary: "List a project's finished tasks, newest first",
        queryStyles: historyQueryStyles,
      })
    )
    .input(projectId.merge(ListPageQuerySchema))
    .output(TaskListPageSchema),
});
