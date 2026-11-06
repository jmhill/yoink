import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { HistoryPageSchema } from '../schemas/history.js';
import { ListPageQuerySchema, TaskListPageSchema } from '../schemas/list-page.js';
import {
  CreateTaskSchema,
  TaskFilterSchema,
  TaskSchema,
  UpdateTaskSchema,
} from '../schemas/task.js';
import { ViewerTodayQuerySchema } from '../schemas/work.js';

/**
 * Query values are JSON-parsed (`queryStyles: 'json'`), so numbers stay
 * numbers and `false` stays false.
 */
const taskListQueryStyles = {
  limit: 'json',
  cursor: 'json',
  filter: 'json',
  timeZone: 'json',
} as const;

const taskHistoryQueryStyles = {
  limit: 'json',
  cursor: 'json',
} as const;

const taskId = z.object({
  id: z.string().uuid(),
});

const taskListQuery = ListPageQuerySchema.extend({
  filter: TaskFilterSchema.optional(),
}).merge(ViewerTodayQuerySchema);

export const taskOrpcContract = oc.router({
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/tasks',
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
        path: '/api/tasks',
        summary: 'List tasks',
        queryStyles: taskListQueryStyles,
      })
    )
    .input(taskListQuery)
    .output(TaskListPageSchema),
  get: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/tasks/{id}',
        summary: 'Get a task by ID',
      })
    )
    .input(taskId)
    .output(TaskSchema),
  update: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/api/tasks/{id}',
        summary: 'Update a task (title, dueDate, assigneeId, listId, projectId)',
      })
    )
    .input(taskId.merge(UpdateTaskSchema))
    .output(TaskSchema),
  complete: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/tasks/{id}/complete',
        summary: 'Mark a task as complete',
      })
    )
    .input(taskId)
    .output(TaskSchema),
  uncomplete: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/tasks/{id}/uncomplete',
        summary: 'Mark a task as incomplete',
      })
    )
    .input(taskId)
    .output(TaskSchema),
  pin: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/tasks/{id}/pin',
        summary: 'Pin a task to top of list',
      })
    )
    .input(taskId)
    .output(TaskSchema),
  unpin: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/tasks/{id}/unpin',
        summary: 'Unpin a task',
      })
    )
    .input(taskId)
    .output(TaskSchema),
  listHistory: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/tasks/{id}/history',
        summary:
          "Read a task's visible change-log timeline in any project or none, including after delete",
        queryStyles: taskHistoryQueryStyles,
      })
    )
    .input(taskId.merge(ListPageQuerySchema))
    .output(HistoryPageSchema),
  delete: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/api/tasks/{id}',
        successStatus: 204,
        summary: 'Delete a task (also deletes source capture if any)',
      })
    )
    .input(taskId)
    .output(z.void()),
});
