import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { projectOrpcContract } from '@yoink/api-contracts/orpc';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import { toProjectListBody, toTaskListBody } from '../../_shared/http-listed-page.js';
import { openApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
// M5.10 keeps history's read handlers on index.ts. The file is still the history element.
import type { HistoryHandlers } from '../../../modules/history/index.js';
// M5.3 removes these deep imports once projects export their handlers from index.ts.
import type { ProjectHandlers } from '../../../projects/application/create-project-handlers.js';
import type { SetProjectNextActionCommand } from '../../../projects/domain/project-commands.js';
import {
  mapApplyImportError,
  mapChangeProjectStatusError,
  mapConfirmProposalError,
  mapCreateProjectError,
  mapDeclineProposalError,
  mapDiscardImportError,
  mapGetImportError,
  mapGetProjectError,
  mapListImportsError,
  mapListProjectHistoryError,
  mapListProjectsError,
  mapListProjectTasksError,
  mapRestoreProposalError,
  mapSetNextActionError,
  mapStageImportError,
  mapUpdateProjectError,
} from '../../../projects/infrastructure/orpc-project-errors.js';
import { projectRequestValidationError } from '../../../projects/infrastructure/project-http-errors.js';

export type ProjectEdgeDependencies = {
  projectHandlers: ProjectHandlers;
  historyHandlers: HistoryHandlers;
};

type Procedure<T> = T extends { handler: (fn: infer Fn) => unknown } ? Fn : never;

export const createProjectHandlers = (deps: ProjectEdgeDependencies) => {
  const { projectHandlers, historyHandlers } = deps;
  const legacy = implement(projectOrpcContract).$context<OrpcHttpContext>();
  const v1 = implement(publicApiV1Contract.projects).$context<OrpcHttpContext>();

  const list: Procedure<typeof legacy.list> = async ({ input, context }) => {
    const result = await projectHandlers.list({
      organizationId: context.request.authContext.organizationId,
      limit: input.limit,
      cursor: input.cursor,
      status: input.status,
      createdById: input.createdById,
      actor: context.request.authContext.actor,
    });
    return result.match(
      (page) => toProjectListBody(page),
      (error) => {
        throw mapListProjectsError(error);
      },
    );
  };
  const create: Procedure<typeof legacy.create> = async ({ input, context }) => {
    const result = await projectHandlers.create({
      name: input.name,
      objective: input.objective,
      status: input.status,
      reason: input.reason,
      suggestedNextAction: input.suggestedNextAction,
      organizationId: context.request.authContext.organizationId,
      createdById: context.request.authContext.userId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapCreateProjectError(error);
      },
    );
  };
  const stageImport: Procedure<typeof legacy.stageImport> = async ({ input, context }) => {
    const result = await projectHandlers.stageImport({
      projects: input.projects,
      organizationId: context.request.authContext.organizationId,
      createdById: context.request.authContext.userId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      (view) => view,
      (error) => {
        throw mapStageImportError(error);
      },
    );
  };
  const listImports: Procedure<typeof legacy.listImports> = async ({ context }) => {
    const result = await projectHandlers.listImports({
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      (body) => body,
      (error) => {
        throw mapListImportsError(error);
      },
    );
  };
  const getImport: Procedure<typeof legacy.getImport> = async ({ input, context }) => {
    const result = await projectHandlers.getImport({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      createdById: context.request.authContext.userId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      (view) => view,
      (error) => {
        throw mapGetImportError(error);
      },
    );
  };
  const applyImport: Procedure<typeof legacy.applyImport> = async ({ input, context }) => {
    const result = await projectHandlers.applyImport({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      (view) => view,
      (error) => {
        throw mapApplyImportError(error);
      },
    );
  };
  const discardImport: Procedure<typeof legacy.discardImport> = async ({ input, context }) => {
    const result = await projectHandlers.discardImport({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      (view) => view,
      (error) => {
        throw mapDiscardImportError(error);
      },
    );
  };
  const get: Procedure<typeof legacy.get> = async ({ input, context }) => {
    const result = await projectHandlers.get({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      (view) => view,
      (error) => {
        throw mapGetProjectError(error);
      },
    );
  };
  const listHistory: Procedure<typeof legacy.listHistory> = async ({ input, context }) => {
    const result = await historyHandlers.listProjectHistory({
      projectId: input.id,
      organizationId: context.request.authContext.organizationId,
      limit: input.limit,
      cursor: input.cursor,
    });
    return result.match(
      (page) => page,
      (error) => {
        throw mapListProjectHistoryError(error);
      },
    );
  };
  const listOpenTasks: Procedure<typeof legacy.listOpenTasks> = async ({ input, context }) => {
    const result =
      input.status === 'finished'
        ? await historyHandlers.listFinishedTasks({
            projectId: input.id,
            organizationId: context.request.authContext.organizationId,
            limit: input.limit,
            cursor: input.cursor,
          })
        : await projectHandlers.listOpenTasks({
            projectId: input.id,
            organizationId: context.request.authContext.organizationId,
            limit: input.limit,
            cursor: input.cursor,
          });
    return result.match(
      (page) => toTaskListBody(page),
      (error) => {
        throw mapListProjectTasksError(error);
      },
    );
  };
  const update: Procedure<typeof legacy.update> = async ({ input, context }) => {
    const result = await projectHandlers.update({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      name: input.name,
      objective: input.objective,
      notebookPages: input.notebookPages,
      reason: input.reason,
      suggestedNextAction: input.suggestedNextAction,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapUpdateProjectError(error);
      },
    );
  };
  const changeStatus: Procedure<typeof legacy.changeStatus> = async ({ input, context }) => {
    const result = await projectHandlers.changeStatus({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      status: input.status,
      waitingOn: input.waitingOn,
      waitingSince: input.waitingSince,
      openTasks: input.openTasks,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view, completedTaskCount, removedTaskCount }) => ({
        project: view,
        completedTaskCount,
        removedTaskCount,
      }),
      (error) => {
        throw mapChangeProjectStatusError(error);
      },
    );
  };
  const confirmProposal: Procedure<typeof legacy.confirmProposal> = async ({ input, context }) => {
    const result = await projectHandlers.confirmProposal({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      name: input.name,
      objective: input.objective,
      status: input.status,
      waitingOn: input.waitingOn,
      waitingSince: input.waitingSince,
      suggestedNextAction: input.suggestedNextAction,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view, task }) => ({
        project: view,
        ...(task ? { task: { id: task.id, title: task.title } } : {}),
      }),
      (error) => {
        throw mapConfirmProposalError(error);
      },
    );
  };
  const declineProposal: Procedure<typeof legacy.declineProposal> = async ({ input, context }) => {
    const result = await projectHandlers.declineProposal({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapDeclineProposalError(error);
      },
    );
  };
  const restoreProposal: Procedure<typeof legacy.restoreProposal> = async ({ input, context }) => {
    const result = await projectHandlers.restoreProposal({
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view }) => view,
      (error) => {
        throw mapRestoreProposalError(error);
      },
    );
  };
  const setNextAction: Procedure<typeof legacy.setNextAction> = async ({ input, context }) => {
    const base = {
      id: input.id,
      organizationId: context.request.authContext.organizationId,
      actor: context.request.authContext.actor,
    };
    const command: SetProjectNextActionCommand =
      'newTask' in input
        ? { type: 'newTask', ...base, newTask: input.newTask }
        : input.taskId === null
          ? { type: 'clear', ...base }
          : { type: 'set', ...base, taskId: input.taskId };
    const result = await projectHandlers.setNextAction(command);
    return result.match(
      ({ view, task }) => ({
        project: view,
        ...(task ? { task: { id: task.id, title: task.title } } : {}),
      }),
      (error) => {
        throw mapSetNextActionError(error);
      },
    );
  };

  const options = openApiHandlerOptions(projectRequestValidationError);
  const legacyRouter = legacy.router({
    list: legacy.list.handler(list),
    create: legacy.create.handler(create),
    stageImport: legacy.stageImport.handler(stageImport),
    listImports: legacy.listImports.handler(listImports),
    getImport: legacy.getImport.handler(getImport),
    applyImport: legacy.applyImport.handler(applyImport),
    discardImport: legacy.discardImport.handler(discardImport),
    get: legacy.get.handler(get),
    listHistory: legacy.listHistory.handler(listHistory),
    listOpenTasks: legacy.listOpenTasks.handler(listOpenTasks),
    update: legacy.update.handler(update),
    changeStatus: legacy.changeStatus.handler(changeStatus),
    confirmProposal: legacy.confirmProposal.handler(confirmProposal),
    declineProposal: legacy.declineProposal.handler(declineProposal),
    restoreProposal: legacy.restoreProposal.handler(restoreProposal),
    setNextAction: legacy.setNextAction.handler(setNextAction),
  });
  const v1Router = v1.router({
    list: v1.list.handler(list),
    create: v1.create.handler(create),
    stageImport: v1.stageImport.handler(stageImport),
    listImports: v1.listImports.handler(listImports),
    getImport: v1.getImport.handler(getImport),
    applyImport: v1.applyImport.handler(applyImport),
    discardImport: v1.discardImport.handler(discardImport),
    get: v1.get.handler(get),
    listHistory: v1.listHistory.handler(listHistory),
    listOpenTasks: v1.listOpenTasks.handler(listOpenTasks),
    update: v1.update.handler(update),
    changeStatus: v1.changeStatus.handler(changeStatus),
    confirmProposal: v1.confirmProposal.handler(confirmProposal),
    declineProposal: v1.declineProposal.handler(declineProposal),
    restoreProposal: v1.restoreProposal.handler(restoreProposal),
    setNextAction: v1.setNextAction.handler(setNextAction),
  });
  return {
    legacy: new OpenAPIHandler(legacyRouter, options),
    v1: new OpenAPIHandler(v1Router, options),
  };
};
