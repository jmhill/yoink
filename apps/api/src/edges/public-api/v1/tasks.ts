import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { taskOrpcContract } from '@yoink/api-contracts/orpc';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import { toTaskListBody } from '../../_shared/http-listed-page.js';
import { toContractHistoryPage } from '../../_shared/map-history-document.js';
import { toContractTask } from '../../_shared/map-task-document.js';
import { openApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import { listedRequestValidationError } from '../../_shared/request-validation.js';
import type { HistoryHandlers } from '../../../modules/history/index.js';
import type { TaskHandlers } from '../../../modules/task-management/index.js';
import {
  mapCompleteTaskError,
  mapCreateTaskError,
  mapDeleteTaskError,
  mapFindTaskError,
  mapListTaskHistoryError,
  mapListTasksError,
  mapPinTaskError,
  mapUncompleteTaskError,
  mapUnpinTaskError,
  mapUpdateTaskError,
} from './orpc-task-errors.js';

export type TaskEdgeDependencies = {
  taskHandlers: TaskHandlers;
  historyHandlers: HistoryHandlers;
};

type Procedure<T> = T extends { handler: (fn: infer Fn) => unknown } ? Fn : never;

export const createTaskHandlers = (deps: TaskEdgeDependencies) => {
  const legacy = implement(taskOrpcContract).$context<OrpcHttpContext>();
  const v1 = implement(publicApiV1Contract.tasks).$context<OrpcHttpContext>();

  const create: Procedure<typeof legacy.create> = async ({ input, context }) => {
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
      },
    );
  };
  const list: Procedure<typeof legacy.list> = async ({ input, context }) => {
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
      },
    );
  };
  const get: Procedure<typeof legacy.get> = async ({ input, context }) => {
    const result = await deps.taskHandlers.get({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      (task) => toContractTask(task),
      (error) => {
        throw mapFindTaskError(error);
      },
    );
  };
  const update: Procedure<typeof legacy.update> = async ({ input, context }) => {
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
      },
    );
  };
  const complete: Procedure<typeof legacy.complete> = async ({ input, context }) => {
    const result = await deps.taskHandlers.complete({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => toContractTask(view),
      (error) => {
        throw mapCompleteTaskError(error);
      },
    );
  };
  const uncomplete: Procedure<typeof legacy.uncomplete> = async ({ input, context }) => {
    const result = await deps.taskHandlers.uncomplete({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => toContractTask(view),
      (error) => {
        throw mapUncompleteTaskError(error);
      },
    );
  };
  const pin: Procedure<typeof legacy.pin> = async ({ input, context }) => {
    const result = await deps.taskHandlers.pin({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => toContractTask(view),
      (error) => {
        throw mapPinTaskError(error);
      },
    );
  };
  const unpin: Procedure<typeof legacy.unpin> = async ({ input, context }) => {
    const result = await deps.taskHandlers.unpin({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => toContractTask(view),
      (error) => {
        throw mapUnpinTaskError(error);
      },
    );
  };
  const listHistory: Procedure<typeof legacy.listHistory> = async ({ input, context }) => {
    const result = await deps.historyHandlers.listTaskHistory({
      taskId: input.id,
      organizationId: context.request.authContext.organizationId,
      limit: input.limit,
      cursor: input.cursor,
    });
    return result.match(
      (page) => toContractHistoryPage(page),
      (error) => {
        throw mapListTaskHistoryError(error);
      },
    );
  };
  const deleteTask: Procedure<typeof legacy.delete> = async ({ input, context }) => {
    const result = await deps.taskHandlers.delete({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      () => undefined,
      (error) => {
        throw mapDeleteTaskError(error);
      },
    );
  };

  const options = openApiHandlerOptions(listedRequestValidationError);
  const legacyRouter = legacy.router({
    create: legacy.create.handler(create),
    list: legacy.list.handler(list),
    get: legacy.get.handler(get),
    update: legacy.update.handler(update),
    complete: legacy.complete.handler(complete),
    uncomplete: legacy.uncomplete.handler(uncomplete),
    pin: legacy.pin.handler(pin),
    unpin: legacy.unpin.handler(unpin),
    listHistory: legacy.listHistory.handler(listHistory),
    delete: legacy.delete.handler(deleteTask),
  });
  const v1Router = v1.router({
    create: v1.create.handler(create),
    list: v1.list.handler(list),
    get: v1.get.handler(get),
    update: v1.update.handler(update),
    complete: v1.complete.handler(complete),
    uncomplete: v1.uncomplete.handler(uncomplete),
    pin: v1.pin.handler(pin),
    unpin: v1.unpin.handler(unpin),
    listHistory: v1.listHistory.handler(listHistory),
    delete: v1.delete.handler(deleteTask),
  });
  return {
    legacy: new OpenAPIHandler(legacyRouter, options),
    v1: new OpenAPIHandler(v1Router, options),
  };
};
