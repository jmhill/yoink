import { oc } from '@orpc/contract';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import {
  captureOrpcContract,
  processCaptureToProjectOrpcContract,
} from '@yoink/api-contracts/orpc';
import { toCaptureListBody } from '../../_shared/http-listed-page.js';
import {
  openApiHandlerOptions,
  yoinkOpenApiHandlerOptions,
} from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
// M5.1 removes these deep imports once captures exports its handlers from index.ts.
// eslint-disable-next-line boundaries/element-types
import type { CaptureHandlers } from '../../../captures/application/create-capture-handlers.js';
// M5.5 removes this deep import once processing exports its workflow from index.ts.
// eslint-disable-next-line boundaries/element-types
import type { CaptureProcessingService } from '../../../processing/application/create-processing-handlers.js';
/* eslint-disable boundaries/element-types -- M5.1 deep import until captures exports these mappers from index.ts */
import {
  mapAgentCaptureRefusal,
  mapCreateCaptureError,
  mapDeleteCaptureError,
  mapEmptyTrashError,
  mapFindCaptureError,
  mapListCapturesError,
  mapProcessCaptureError,
  mapProcessCaptureToProjectError,
  mapRestoreCaptureError,
  mapSnoozeCaptureError,
  mapTrashCaptureError,
  mapUnsnoozeCaptureError,
  mapUpdateCaptureError,
} from '../../../captures/infrastructure/orpc-capture-errors.js';
/* eslint-enable boundaries/element-types */
// M5.3 removes this deep import. Process-to-project keeps today's project validation body.
// eslint-disable-next-line boundaries/element-types
import { projectRequestValidationError } from '../../../projects/infrastructure/project-http-errors.js';

export type CaptureEdgeDependencies = {
  captureHandlers: CaptureHandlers;
  captureProcessingService: CaptureProcessingService;
};

const v1Captures = oc.router({
  create: publicApiV1Contract.captures.create,
  list: publicApiV1Contract.captures.list,
  get: publicApiV1Contract.captures.get,
  update: publicApiV1Contract.captures.update,
  trash: publicApiV1Contract.captures.trash,
  restore: publicApiV1Contract.captures.restore,
  snooze: publicApiV1Contract.captures.snooze,
  unsnooze: publicApiV1Contract.captures.unsnooze,
  delete: publicApiV1Contract.captures.delete,
  emptyTrash: publicApiV1Contract.captures.emptyTrash,
  process: publicApiV1Contract.captures.process,
});

const v1ProcessToProject = oc.router({
  processToProject: publicApiV1Contract.captures.processToProject,
});

type Procedure<T> = T extends { handler: (fn: infer Fn) => unknown } ? Fn : never;

export const createCaptureHandlers = (deps: CaptureEdgeDependencies) => {
  const legacy = implement(captureOrpcContract).$context<OrpcHttpContext>();
  const project = implement(processCaptureToProjectOrpcContract).$context<OrpcHttpContext>();
  const v1 = implement(v1Captures).$context<OrpcHttpContext>();
  const v1Project = implement(v1ProcessToProject).$context<OrpcHttpContext>();

  const create: Procedure<typeof legacy.create> = async ({ input, context }) => {
    const refusal = mapAgentCaptureRefusal(context.request.authContext.principalKind);
    if (refusal) throw refusal;
    const result = await deps.captureHandlers.create({
      content: input.content,
      title: input.title,
      sourceUrl: input.sourceUrl,
      sourceApp: input.sourceApp,
      organizationId: context.request.authContext.organizationId,
      createdById: context.request.authContext.userId,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapCreateCaptureError(error);
      },
    );
  };
  const list: Procedure<typeof legacy.list> = async ({ input, context }) => {
    const result = await deps.captureHandlers.list({
      organizationId: context.request.authContext.organizationId,
      status: input.status,
      snoozed: input.snoozed,
      limit: input.limit,
      cursor: input.cursor,
    });
    return result.match(
      (page) => toCaptureListBody(page),
      (error) => {
        throw mapListCapturesError(error);
      },
    );
  };
  const get: Procedure<typeof legacy.get> = async ({ input, context }) => {
    const result = await deps.captureHandlers.find({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      (capture) => capture,
      (error) => {
        throw mapFindCaptureError(error);
      },
    );
  };
  const update: Procedure<typeof legacy.update> = async ({ input, context }) => {
    const result = await deps.captureHandlers.update({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      title: input.title,
      content: input.content,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapUpdateCaptureError(error);
      },
    );
  };
  const trash: Procedure<typeof legacy.trash> = async ({ input, context }) => {
    const result = await deps.captureHandlers.trash({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapTrashCaptureError(error);
      },
    );
  };
  const restore: Procedure<typeof legacy.restore> = async ({ input, context }) => {
    const result = await deps.captureHandlers.restore({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapRestoreCaptureError(error);
      },
    );
  };
  const snooze: Procedure<typeof legacy.snooze> = async ({ input, context }) => {
    const result = await deps.captureHandlers.snooze({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      until: input.until,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapSnoozeCaptureError(error);
      },
    );
  };
  const unsnooze: Procedure<typeof legacy.unsnooze> = async ({ input, context }) => {
    const result = await deps.captureHandlers.unsnooze({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapUnsnoozeCaptureError(error);
      },
    );
  };
  const deleteCapture: Procedure<typeof legacy.delete> = async ({ input, context }) => {
    const result = await deps.captureHandlers.delete({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      () => undefined,
      (error) => {
        throw mapDeleteCaptureError(error);
      },
    );
  };
  const emptyTrash: Procedure<typeof legacy.emptyTrash> = async ({ context }) => {
    const result = await deps.captureHandlers.emptyTrash({
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      (emptied) => ({ deletedCount: emptied.deletedCount }),
      (error) => {
        throw mapEmptyTrashError(error);
      },
    );
  };
  const process: Procedure<typeof legacy.process> = async ({ input, context }) => {
    const result = await deps.captureProcessingService.processCaptureToTask({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      createdById: context.request.authContext.userId,
      title: input.data.title,
      dueDate: input.data.dueDate,
      listId: input.data.listId,
      projectId: input.data.projectId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      (task) => task,
      (error) => {
        throw mapProcessCaptureError(error);
      },
    );
  };
  const processToProject: Procedure<typeof project.processToProject> = async ({ input, context }) => {
    const result = await deps.captureProcessingService.processCaptureToProject({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      createdById: context.request.authContext.userId,
      name: input.name,
      objective: input.objective,
      status: input.status,
      actor: context.request.authContext.actor,
    });
    return result.match(
      (value) => value,
      (error) => {
        throw mapProcessCaptureToProjectError(error);
      },
    );
  };

  const legacyRouter = legacy.router({
    create: legacy.create.handler(create),
    list: legacy.list.handler(list),
    get: legacy.get.handler(get),
    update: legacy.update.handler(update),
    trash: legacy.trash.handler(trash),
    restore: legacy.restore.handler(restore),
    snooze: legacy.snooze.handler(snooze),
    unsnooze: legacy.unsnooze.handler(unsnooze),
    delete: legacy.delete.handler(deleteCapture),
    emptyTrash: legacy.emptyTrash.handler(emptyTrash),
    process: legacy.process.handler(process),
  });
  const legacyProjectRouter = project.router({
    processToProject: project.processToProject.handler(processToProject),
  });
  const v1Router = v1.router({
    create: v1.create.handler(create),
    list: v1.list.handler(list),
    get: v1.get.handler(get),
    update: v1.update.handler(update),
    trash: v1.trash.handler(trash),
    restore: v1.restore.handler(restore),
    snooze: v1.snooze.handler(snooze),
    unsnooze: v1.unsnooze.handler(unsnooze),
    delete: v1.delete.handler(deleteCapture),
    emptyTrash: v1.emptyTrash.handler(emptyTrash),
    process: v1.process.handler(process),
  });
  const v1ProjectRouter = v1Project.router({
    processToProject: v1Project.processToProject.handler(processToProject),
  });

  return {
    legacyCaptures: new OpenAPIHandler(legacyRouter, yoinkOpenApiHandlerOptions),
    legacyProject: new OpenAPIHandler(legacyProjectRouter, openApiHandlerOptions(projectRequestValidationError)),
    v1Captures: new OpenAPIHandler(v1Router, yoinkOpenApiHandlerOptions),
    v1Project: new OpenAPIHandler(v1ProjectRouter, openApiHandlerOptions(projectRequestValidationError)),
  };
};
