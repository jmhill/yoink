import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { workOrpcContract } from '@yoink/api-contracts/orpc';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import { toTaskListBody, toWorkListsBody, toWorkNextActionsBody } from '../../_shared/http-listed-page.js';
import { openApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import { listedRequestValidationError } from '../../_shared/request-validation.js';
// M5.2 keeps these routes on the public API edge and moves the queries into task-management.
// eslint-disable-next-line boundaries/element-types
import type { WorkHandlers } from '../../../work/application/create-work-handlers.js';
/* eslint-disable boundaries/element-types -- M5.2 deep import until work queries move into task-management */
import {
  mapListDueError,
  mapListNextActionsError,
  mapListWorkListsError,
} from '../../../work/infrastructure/orpc-work-errors.js';
/* eslint-enable boundaries/element-types */

export type WorkEdgeDependencies = { workHandlers: WorkHandlers };

type Procedure<T> = T extends { handler: (fn: infer Fn) => unknown } ? Fn : never;

export const createWorkHandlers = (deps: WorkEdgeDependencies) => {
  const legacy = implement(workOrpcContract).$context<OrpcHttpContext>();
  const v1 = implement(publicApiV1Contract.work).$context<OrpcHttpContext>();

  const listNextActions: Procedure<typeof legacy.listNextActions> = async ({ input, context }) => {
    const result = await deps.workHandlers.listNextActions({
      organizationId: context.request.authContext.organizationId,
      callerId: context.request.authContext.userId,
      owner: input.owner,
      limit: input.limit,
      cursor: input.cursor,
    });
    return result.match(
      (page) => toWorkNextActionsBody(page),
      (error) => {
        throw mapListNextActionsError(error);
      },
    );
  };
  const listDue: Procedure<typeof legacy.listDue> = async ({ input, context }) => {
    const result = await deps.workHandlers.listDue({
      organizationId: context.request.authContext.organizationId,
      callerId: context.request.authContext.userId,
      owner: input.owner,
      limit: input.limit,
      cursor: input.cursor,
      timeZone: input.timeZone,
    });
    return result.match(
      (page) => toTaskListBody(page),
      (error) => {
        throw mapListDueError(error);
      },
    );
  };
  const listLists: Procedure<typeof legacy.listLists> = async ({ input, context }) => {
    const result = await deps.workHandlers.listLists({
      organizationId: context.request.authContext.organizationId,
      limit: input.limit,
      cursor: input.cursor,
    });
    return result.match(
      (page) => toWorkListsBody(page),
      (error) => {
        throw mapListWorkListsError(error);
      },
    );
  };

  const options = openApiHandlerOptions(listedRequestValidationError);
  const legacyRouter = legacy.router({
    listNextActions: legacy.listNextActions.handler(listNextActions),
    listDue: legacy.listDue.handler(listDue),
    listLists: legacy.listLists.handler(listLists),
  });
  const v1Router = v1.router({
    listNextActions: v1.listNextActions.handler(listNextActions),
    listDue: v1.listDue.handler(listDue),
    listLists: v1.listLists.handler(listLists),
  });
  return {
    legacy: new OpenAPIHandler(legacyRouter, options),
    v1: new OpenAPIHandler(v1Router, options),
  };
};
