import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { listOrpcContract } from '@yoink/api-contracts/orpc';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import { toNamedListListBody, toTaskListBody } from '../../_shared/http-listed-page.js';
import { yoinkOpenApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import type { ListHandlers } from '../../../modules/task-management/index.js';
import {
  mapCreateNamedListError,
  mapDeleteNamedListError,
  mapListNamedListsError,
  mapListOpenTasksError,
  mapListUnlistedOpenTasksError,
  mapRenameNamedListError,
  mapReorderOpenTasksError,
  mapReorderUnlistedOpenTasksError,
} from './orpc-list-errors.js';

export type ListEdgeDependencies = { listHandlers: ListHandlers };

type Procedure<T> = T extends { handler: (fn: infer Fn) => unknown } ? Fn : never;

export const createListHandlers = (deps: ListEdgeDependencies) => {
  const legacy = implement(listOrpcContract).$context<OrpcHttpContext>();
  const v1 = implement(publicApiV1Contract.lists).$context<OrpcHttpContext>();

  const list: Procedure<typeof legacy.list> = async ({ input, context }) => {
    const result = await deps.listHandlers.list({
      organizationId: context.request.authContext.organizationId,
      limit: input.limit,
      cursor: input.cursor,
    });
    return result.match(
      (page) => toNamedListListBody(page),
      (error) => {
        throw mapListNamedListsError(error);
      },
    );
  };
  const create: Procedure<typeof legacy.create> = async ({ input, context }) => {
    const result = await deps.listHandlers.create({
      name: input.name,
      organizationId: context.request.authContext.organizationId,
      createdById: context.request.authContext.userId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapCreateNamedListError(error);
      },
    );
  };
  const rename: Procedure<typeof legacy.rename> = async ({ input, context }) => {
    const result = await deps.listHandlers.rename({
      id: input.id,
      name: input.name,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapRenameNamedListError(error);
      },
    );
  };
  const listOpenTasks: Procedure<typeof legacy.listOpenTasks> = async ({ input, context }) => {
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
      },
    );
  };
  const reorderOpenTasks: Procedure<typeof legacy.reorderOpenTasks> = async ({ input, context }) => {
    const result = await deps.listHandlers.reorderOpenTasks({
      listId: input.id,
      organizationId: context.request.authContext.organizationId,
      taskIds: input.taskIds,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ tasks }) => ({ tasks }),
      (error) => {
        throw mapReorderOpenTasksError(error);
      },
    );
  };
  const listUnlistedOpenTasks: Procedure<typeof legacy.listUnlistedOpenTasks> = async ({ input, context }) => {
    const result = await deps.listHandlers.listUnlistedOpenTasks({
      organizationId: context.request.authContext.organizationId,
      limit: input.limit,
      cursor: input.cursor,
    });
    return result.match(
      (page) => toTaskListBody(page),
      (error) => {
        throw mapListUnlistedOpenTasksError(error);
      },
    );
  };
  const reorderUnlistedOpenTasks: Procedure<typeof legacy.reorderUnlistedOpenTasks> = async ({ input, context }) => {
    const result = await deps.listHandlers.reorderUnlistedOpenTasks({
      organizationId: context.request.authContext.organizationId,
      taskIds: input.taskIds,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ tasks }) => ({ tasks }),
      (error) => {
        throw mapReorderUnlistedOpenTasksError(error);
      },
    );
  };
  const deleteList: Procedure<typeof legacy.delete> = async ({ input, context }) => {
    const result = await deps.listHandlers.delete({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      () => undefined,
      (error) => {
        throw mapDeleteNamedListError(error);
      },
    );
  };

  const procedures = {
    list,
    create,
    rename,
    listOpenTasks,
    reorderOpenTasks,
    listUnlistedOpenTasks,
    reorderUnlistedOpenTasks,
    delete: deleteList,
  };
  const legacyRouter = legacy.router({
    list: legacy.list.handler(procedures.list),
    create: legacy.create.handler(procedures.create),
    rename: legacy.rename.handler(procedures.rename),
    listOpenTasks: legacy.listOpenTasks.handler(procedures.listOpenTasks),
    reorderOpenTasks: legacy.reorderOpenTasks.handler(procedures.reorderOpenTasks),
    listUnlistedOpenTasks: legacy.listUnlistedOpenTasks.handler(procedures.listUnlistedOpenTasks),
    reorderUnlistedOpenTasks: legacy.reorderUnlistedOpenTasks.handler(procedures.reorderUnlistedOpenTasks),
    delete: legacy.delete.handler(procedures.delete),
  });
  const v1Router = v1.router({
    list: v1.list.handler(procedures.list),
    create: v1.create.handler(procedures.create),
    rename: v1.rename.handler(procedures.rename),
    listOpenTasks: v1.listOpenTasks.handler(procedures.listOpenTasks),
    reorderOpenTasks: v1.reorderOpenTasks.handler(procedures.reorderOpenTasks),
    listUnlistedOpenTasks: v1.listUnlistedOpenTasks.handler(procedures.listUnlistedOpenTasks),
    reorderUnlistedOpenTasks: v1.reorderUnlistedOpenTasks.handler(procedures.reorderUnlistedOpenTasks),
    delete: v1.delete.handler(procedures.delete),
  });
  return {
    legacy: new OpenAPIHandler(legacyRouter, yoinkOpenApiHandlerOptions),
    v1: new OpenAPIHandler(v1Router, yoinkOpenApiHandlerOptions),
  };
};
