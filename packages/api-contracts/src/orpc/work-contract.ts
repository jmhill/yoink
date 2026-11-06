import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { ListPageQuerySchema, TaskListPageSchema } from '../schemas/list-page.js';
import {
  WorkDueQuerySchema,
  WorkListsPageSchema,
  WorkNextActionsPageSchema,
  WorkNextActionsQuerySchema,
} from '../schemas/work.js';

/**
 * Query values are JSON-parsed (`queryStyles: 'json'`), so numbers stay
 * numbers and `false` stays false.
 */
const pageQueryStyles = {
  limit: 'json',
  cursor: 'json',
} as const;

const nextActionsQueryStyles = {
  limit: 'json',
  cursor: 'json',
  owner: 'json',
} as const;

const dueQueryStyles = {
  limit: 'json',
  cursor: 'json',
  owner: 'json',
  timeZone: 'json',
} as const;

export const workOrpcContract = oc.router({
  listNextActions: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/work/next-actions',
        summary:
          "List each active project's open next action. owner=me keeps only the caller's assigned tasks.",
        queryStyles: nextActionsQueryStyles,
      })
    )
    .input(WorkNextActionsQuerySchema)
    .output(WorkNextActionsPageSchema),
  listDue: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/work/due',
        summary:
          'List open tasks due on or before the viewer today that are not already shown as a next action.',
        queryStyles: dueQueryStyles,
      })
    )
    .input(WorkDueQuerySchema)
    .output(TaskListPageSchema),
  listLists: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/work/lists',
        summary:
          'Named lists in GET /api/lists order with open-task counts, plus the Unlisted open count.',
        queryStyles: pageQueryStyles,
      })
    )
    .input(ListPageQuerySchema)
    .output(WorkListsPageSchema),
});
