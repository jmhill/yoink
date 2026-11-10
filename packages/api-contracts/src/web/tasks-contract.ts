import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { ListPageQuerySchema, TaskListPageSchema } from '../schemas/list-page.js';
import {
  CreateTaskSchema,
  TaskFilterSchema,
  TaskSchema,
  UpdateTaskSchema,
} from '../schemas/task.js';
import { ViewerTodayQuerySchema } from '../schemas/work.js';

/**
 * Query values are JSON-parsed. Otherwise they stay strings, and
 * `z.coerce.boolean()` turns `"false"` into `true`.
 */
const taskListQueryStyles = {
  limit: 'json',
  cursor: 'json',
  filter: 'json',
  timeZone: 'json',
} as const;

const taskId = z.object({
  id: z.string().uuid(),
});

const taskListQuery = ListPageQuerySchema.extend({
  filter: TaskFilterSchema.optional(),
}).merge(ViewerTodayQuerySchema);

/**
 * Task board reads and writes. Paths are the resource after `/web-api`.
 * Get, pin, and history stay on `/api` until their screens move.
 * The same procedures stay on `/api` and `/api/v1`.
 */
export const webTasksContract = oc.router({
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/tasks',
        successStatus: 201,
        summary: 'Create a new task',
      })
    )
    .input(CreateTaskSchema)
    .output(TaskSchema),
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/tasks',
        summary: 'List tasks',
        queryStyles: taskListQueryStyles,
      })
    )
    .input(taskListQuery)
    .output(TaskListPageSchema),
  update: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/tasks/{id}',
        summary: 'Update a task (title, dueDate, assigneeId, listId, projectId)',
      })
    )
    .input(taskId.merge(UpdateTaskSchema))
    .output(TaskSchema),
  complete: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/tasks/{id}/complete',
        summary: 'Mark a task as complete',
      })
    )
    .input(taskId)
    .output(TaskSchema),
  uncomplete: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/tasks/{id}/uncomplete',
        summary: 'Mark a task as incomplete',
      })
    )
    .input(taskId)
    .output(TaskSchema),
  delete: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/tasks/{id}',
        successStatus: 204,
        summary: 'Delete a task (also deletes source capture if any)',
      })
    )
    .input(taskId)
    .output(z.void()),
});
