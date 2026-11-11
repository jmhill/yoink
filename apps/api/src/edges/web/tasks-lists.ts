import { implement } from '@orpc/server';
import { webListsContract, webTasksContract } from '@yoink/api-contracts/web';
import type { ListHandlers, TaskHandlers } from '../../modules/task-management/index.js';
import { toNamedListListBody, toTaskListBody } from '../_shared/http-listed-page.js';
import { toContractNamedList, toContractTask } from '../_shared/map-task-document.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import {
  mapCompleteTaskError,
  mapCreateNamedListError,
  mapCreateTaskError,
  mapDeleteNamedListError,
  mapDeleteTaskError,
  mapListNamedListsError,
  mapListOpenTasksError,
  mapListTasksError,
  mapListUnlistedOpenTasksError,
  mapRenameNamedListError,
  mapReorderOpenTasksError,
  mapReorderUnlistedOpenTasksError,
  mapUncompleteTaskError,
  mapUpdateTaskError,
} from './tasks-lists-errors.js';

/**
 * Methods this screen calls. The rest of each handler stays off the port.
 * Now, due, and work-list queries stay on Task Management for M6.3-work.
 */
export type WebTasksListsDependencies = {
  listHandlers: Pick<
    ListHandlers,
    | 'list'
    | 'create'
    | 'rename'
    | 'delete'
    | 'listOpenTasks'
    | 'reorderOpenTasks'
    | 'listUnlistedOpenTasks'
    | 'reorderUnlistedOpenTasks'
  >;
  taskHandlers: Pick<
    TaskHandlers,
    'create' | 'list' | 'update' | 'complete' | 'uncomplete' | 'delete'
  >;
};

/**
 * Tasks and lists. Each handler calls one task-management command or query.
 * Listed pages and reorder results stay in that query's order. This edge
 * does not sort them, and it does not build Now, due, or work-list sections.
 */
export const createWebTasksListsHandlers = (deps: WebTasksListsDependencies) => {
  const lists = implement(webListsContract).$context<OrpcHttpContext>();
  const tasks = implement(webTasksContract).$context<OrpcHttpContext>();

  return {
    lists: lists.router({
      list: lists.list.handler(async ({ input, context }) => {
        const result = await deps.listHandlers.list({
          organizationId: context.request.authContext.organizationId,
          limit: input.limit,
          cursor: input.cursor,
        });
        return result.match(
          (page) => toNamedListListBody(page),
          (error) => {
            throw mapListNamedListsError(error);
          }
        );
      }),
      create: lists.create.handler(async ({ input, context }) => {
        const result = await deps.listHandlers.create({
          name: input.name,
          organizationId: context.request.authContext.organizationId,
          createdById: context.request.authContext.userId,
          actor: context.request.authContext.actor,
        });
        return result.match(
          ({ view }) => toContractNamedList(view),
          (error) => {
            throw mapCreateNamedListError(error);
          }
        );
      }),
      rename: lists.rename.handler(async ({ input, context }) => {
        const result = await deps.listHandlers.rename({
          id: input.id,
          name: input.name,
          organizationId: context.request.authContext.organizationId,
          actor: context.request.authContext.actor,
        });
        return result.match(
          ({ view }) => toContractNamedList(view),
          (error) => {
            throw mapRenameNamedListError(error);
          }
        );
      }),
      delete: lists.delete.handler(async ({ input, context }) => {
        const result = await deps.listHandlers.delete({
          id: input.id,
          organizationId: context.request.authContext.organizationId,
          actor: context.request.authContext.actor,
        });
        return result.match(
          () => undefined,
          (error) => {
            throw mapDeleteNamedListError(error);
          }
        );
      }),
      listOpenTasks: lists.listOpenTasks.handler(async ({ input, context }) => {
        const result = await deps.listHandlers.listOpenTasks({
          listId: input.id,
          organizationId: context.request.authContext.organizationId,
          limit: input.limit,
          cursor: input.cursor,
        });
        return result.match(
          (page) => toTaskListBody(page),
          (error) => {
            throw mapListOpenTasksError(error);
          }
        );
      }),
      reorderOpenTasks: lists.reorderOpenTasks.handler(async ({ input, context }) => {
        const result = await deps.listHandlers.reorderOpenTasks({
          listId: input.id,
          organizationId: context.request.authContext.organizationId,
          taskIds: input.taskIds,
          actor: context.request.authContext.actor,
        });
        return result.match(
          ({ tasks: ordered }) => ({ tasks: ordered.map(toContractTask) }),
          (error) => {
            throw mapReorderOpenTasksError(error);
          }
        );
      }),
      listUnlistedOpenTasks: lists.listUnlistedOpenTasks.handler(async ({ input, context }) => {
        const result = await deps.listHandlers.listUnlistedOpenTasks({
          organizationId: context.request.authContext.organizationId,
          limit: input.limit,
          cursor: input.cursor,
        });
        return result.match(
          (page) => toTaskListBody(page),
          (error) => {
            throw mapListUnlistedOpenTasksError(error);
          }
        );
      }),
      reorderUnlistedOpenTasks: lists.reorderUnlistedOpenTasks.handler(async ({ input, context }) => {
        const result = await deps.listHandlers.reorderUnlistedOpenTasks({
          organizationId: context.request.authContext.organizationId,
          taskIds: input.taskIds,
          actor: context.request.authContext.actor,
        });
        return result.match(
          ({ tasks: ordered }) => ({ tasks: ordered.map(toContractTask) }),
          (error) => {
            throw mapReorderUnlistedOpenTasksError(error);
          }
        );
      }),
    }),
    tasks: tasks.router({
      create: tasks.create.handler(async ({ input, context }) => {
        const result = await deps.taskHandlers.create({
          title: input.title,
          dueDate: input.dueDate,
          assigneeId: input.assigneeId,
          listId: input.listId,
          projectId: input.projectId,
          organizationId: context.request.authContext.organizationId,
          createdById: context.request.authContext.userId,
          actor: context.request.authContext.actor,
        });
        return result.match(
          ({ view }) => toContractTask(view),
          (error) => {
            throw mapCreateTaskError(error);
          }
        );
      }),
      list: tasks.list.handler(async ({ input, context }) => {
        const result = await deps.taskHandlers.list({
          organizationId: context.request.authContext.organizationId,
          filter: input.filter,
          limit: input.limit,
          cursor: input.cursor,
          callerId: context.request.authContext.userId,
          timeZone: input.timeZone,
        });
        return result.match(
          (page) => toTaskListBody(page),
          (error) => {
            throw mapListTasksError(error);
          }
        );
      }),
      update: tasks.update.handler(async ({ input, context }) => {
        const result = await deps.taskHandlers.update({
          id: input.id,
          organizationId: context.request.authContext.organizationId,
          title: input.title,
          dueDate: input.dueDate,
          assigneeId: input.assigneeId,
          listId: input.listId,
          projectId: input.projectId,
          actor: context.request.authContext.actor,
        });
        return result.match(
          ({ view }) => toContractTask(view),
          (error) => {
            throw mapUpdateTaskError(error);
          }
        );
      }),
      complete: tasks.complete.handler(async ({ input, context }) => {
        const result = await deps.taskHandlers.complete({
          id: input.id,
          organizationId: context.request.authContext.organizationId,
          actor: context.request.authContext.actor,
        });
        return result.match(
          ({ view }) => toContractTask(view),
          (error) => {
            throw mapCompleteTaskError(error);
          }
        );
      }),
      uncomplete: tasks.uncomplete.handler(async ({ input, context }) => {
        const result = await deps.taskHandlers.uncomplete({
          id: input.id,
          organizationId: context.request.authContext.organizationId,
          actor: context.request.authContext.actor,
        });
        return result.match(
          ({ view }) => toContractTask(view),
          (error) => {
            throw mapUncompleteTaskError(error);
          }
        );
      }),
      delete: tasks.delete.handler(async ({ input, context }) => {
        const result = await deps.taskHandlers.delete({
          id: input.id,
          organizationId: context.request.authContext.organizationId,
          actor: context.request.authContext.actor,
        });
        return result.match(
          () => undefined,
          (error) => {
            throw mapDeleteTaskError(error);
          }
        );
      }),
    }),
  };
};
