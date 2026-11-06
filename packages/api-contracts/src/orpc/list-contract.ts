import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import {
  ListPageQuerySchema,
  NamedListListPageSchema,
  TaskListPageSchema,
} from '../schemas/list-page.js';
import {
  CreateNamedListSchema,
  NamedListSchema,
  RenameNamedListSchema,
  ReorderOpenTasksSchema,
} from '../schemas/list.js';
import { TaskSchema } from '../schemas/task.js';

/**
 * Query values are JSON-parsed (`queryStyles: 'json'`), so numbers stay
 * numbers and `false` stays false.
 */
const listPageQueryStyles = {
  limit: 'json',
  cursor: 'json',
} as const;

const listId = z.object({
  id: z.string().uuid(),
});

const orderedTasks = z.object({
  tasks: z.array(TaskSchema),
});

export const listOrpcContract = oc.router({
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/lists',
        summary: "View this organization's named lists",
        queryStyles: listPageQueryStyles,
      })
    )
    .input(ListPageQuerySchema)
    .output(NamedListListPageSchema),
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/lists',
        successStatus: 201,
        summary: 'Create a named list in this organization',
      })
    )
    .input(CreateNamedListSchema)
    .output(NamedListSchema),
  rename: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/api/lists/{id}',
        summary: 'Rename a named list in this organization',
      })
    )
    .input(listId.merge(RenameNamedListSchema))
    .output(NamedListSchema),
  delete: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/api/lists/{id}',
        successStatus: 204,
        summary: 'Delete a named list that has no open tasks',
      })
    )
    .input(listId)
    .output(z.void()),
  listOpenTasks: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/lists/{id}/tasks',
        summary: 'List open tasks on a named list in open order',
        queryStyles: listPageQueryStyles,
      })
    )
    .input(listId.merge(ListPageQuerySchema))
    .output(TaskListPageSchema),
  reorderOpenTasks: oc
    .meta(
      openapi({
        method: 'PUT',
        path: '/api/lists/{id}/tasks/order',
        summary: 'Change the open-task order on a named list',
      })
    )
    .input(listId.merge(ReorderOpenTasksSchema))
    .output(orderedTasks),
  listUnlistedOpenTasks: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/unlisted/tasks',
        summary: 'List open unlisted tasks in open order',
        queryStyles: listPageQueryStyles,
      })
    )
    .input(ListPageQuerySchema)
    .output(TaskListPageSchema),
  reorderUnlistedOpenTasks: oc
    .meta(
      openapi({
        method: 'PUT',
        path: '/api/unlisted/tasks/order',
        summary: 'Change the open-task order of the unlisted pile',
      })
    )
    .input(ReorderOpenTasksSchema)
    .output(orderedTasks),
});
