import { oc } from '@orpc/contract';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import {
  captureOrpcContract,
  processCaptureToProjectOrpcContract,
} from '@yoink/api-contracts/orpc';
import { toContractCapture, toContractCaptureList } from './map-capture.js';
import {
  openApiHandlerOptions,
  yoinkOpenApiHandlerOptions,
} from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import type { Captures } from '../../../modules/captures/index.js';
// M5.5 removes this deep import once processing exports its workflow from index.ts.
import type { CaptureProcessingService } from '../../../processing/application/create-processing-handlers.js';
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
} from './orpc-capture-errors.js';
// Process-to-project keeps today's project validation body. The mapper lives on this edge.
import { projectRequestValidationError } from './project-http-errors.js';

export type CaptureEdgeDependencies = {
  captures: Captures;
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
    const result = await deps.captures.commands.createCapture({
      content: input.content,
      title: input.title,
      sourceUrl: input.sourceUrl,
      sourceApp: input.sourceApp,
      organizationId: context.request.authContext.organizationId,
      createdById: context.request.authContext.userId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => toContractCapture(view),
      (error) => {
        throw mapCreateCaptureError(error);
      },
    );
  };
  const list: Procedure<typeof legacy.list> = async ({ input, context }) => {
    const result = await deps.captures.queries.listCaptures({
      organizationId: context.request.authContext.organizationId,
      status: input.status,
      snoozed: input.snoozed,
      limit: input.limit,
      cursor: input.cursor,
    });
    return result.match(
      (page) => toContractCaptureList(page),
      (error) => {
        throw mapListCapturesError(error);
      },
    );
  };
  const get: Procedure<typeof legacy.get> = async ({ input, context }) => {
    const result = await deps.captures.queries.findCapture({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      (capture) => toContractCapture(capture),
      (error) => {
        throw mapFindCaptureError(error);
      },
    );
  };
  const update: Procedure<typeof legacy.update> = async ({ input, context }) => {
    const result = await deps.captures.commands.updateCapture({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      title: input.title,
      content: input.content,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => toContractCapture(view),
      (error) => {
        throw mapUpdateCaptureError(error);
      },
    );
  };
  const trash: Procedure<typeof legacy.trash> = async ({ input, context }) => {
    const result = await deps.captures.commands.trashCapture({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => toContractCapture(view),
      (error) => {
        throw mapTrashCaptureError(error);
      },
    );
  };
  const restore: Procedure<typeof legacy.restore> = async ({ input, context }) => {
    const result = await deps.captures.commands.restoreCapture({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => toContractCapture(view),
      (error) => {
        throw mapRestoreCaptureError(error);
      },
    );
  };
  const snooze: Procedure<typeof legacy.snooze> = async ({ input, context }) => {
    const result = await deps.captures.commands.snoozeCapture({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      until: input.until,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => toContractCapture(view),
      (error) => {
        throw mapSnoozeCaptureError(error);
      },
    );
  };
  const unsnooze: Procedure<typeof legacy.unsnooze> = async ({ input, context }) => {
    const result = await deps.captures.commands.unsnoozeCapture({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => toContractCapture(view),
      (error) => {
        throw mapUnsnoozeCaptureError(error);
      },
    );
  };
  const deleteCapture: Procedure<typeof legacy.delete> = async ({ input, context }) => {
    const result = await deps.captures.commands.deleteCapture({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      () => undefined,
      (error) => {
        throw mapDeleteCaptureError(error);
      },
    );
  };
  const emptyTrash: Procedure<typeof legacy.emptyTrash> = async ({ context }) => {
    const result = await deps.captures.commands.emptyTrash({
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
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
