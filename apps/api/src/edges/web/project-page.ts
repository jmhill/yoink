import { implement } from '@orpc/server';
import { webProjectsContract } from '@yoink/api-contracts/web';
import type {
  ProjectHandlers,
  SetProjectNextActionCommand,
} from '../../modules/task-management/index.js';
import { toTaskListBody } from '../_shared/http-listed-page.js';
import {
  toContractAppliedImport,
  toContractDiscardedImport,
  toContractProject,
  toContractStagedImport,
} from '../_shared/map-task-document.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import {
  mapApplyImportError,
  mapChangeProjectStatusError,
  mapConfirmProposalError,
  mapDeclineProposalError,
  mapDiscardImportError,
  mapGetImportError,
  mapGetProjectError,
  mapListImportsError,
  mapListOpenTasksOnProjectError,
  mapRestoreProposalError,
  mapSetNextActionError,
  mapUpdateProjectError,
} from './project-page-errors.js';

/**
 * Methods this screen calls. The rest of the handler stays off the port.
 * Finished tasks and history are the web history edge.
 */
export type WebProjectPageDependencies = {
  projectHandlers: Pick<
    ProjectHandlers,
    | 'get'
    | 'listOpenTasks'
    | 'update'
    | 'changeStatus'
    | 'setNextAction'
    | 'confirmProposal'
    | 'declineProposal'
    | 'restoreProposal'
    | 'listImports'
    | 'getImport'
    | 'applyImport'
    | 'discardImport'
  >;
};

/**
 * Project page and staged import. Each handler calls one task-management
 * command or query. Open-task pages stay in that query's order. This edge
 * does not sort them, and it does not read finished tasks or history.
 * The page arranges one returned page into the next-action section and the
 * other open tasks, and it adds the count. That split is a filter, not a sort.
 */
export const createWebProjectPageHandlers = (deps: WebProjectPageDependencies) => {
  const projects = implement(webProjectsContract).$context<OrpcHttpContext>();

  return projects.router({
    get: projects.get.handler(async ({ input, context }) => {
      const result = await deps.projectHandlers.get({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
      });
      return result.match(
        (view) => toContractProject(view),
        (error) => {
          throw mapGetProjectError(error);
        }
      );
    }),
    listOpenTasks: projects.listOpenTasks.handler(async ({ input, context }) => {
      const result = await deps.projectHandlers.listOpenTasks({
        projectId: input.id,
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });
      return result.match(
        (page) => toTaskListBody(page),
        (error) => {
          throw mapListOpenTasksOnProjectError(error);
        }
      );
    }),
    update: projects.update.handler(async ({ input, context }) => {
      const result = await deps.projectHandlers.update({
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
        ({ view }) => toContractProject(view),
        (error) => {
          throw mapUpdateProjectError(error);
        }
      );
    }),
    changeStatus: projects.changeStatus.handler(async ({ input, context }) => {
      const result = await deps.projectHandlers.changeStatus({
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
          project: toContractProject(view),
          completedTaskCount,
          removedTaskCount,
        }),
        (error) => {
          throw mapChangeProjectStatusError(error);
        }
      );
    }),
    setNextAction: projects.setNextAction.handler(async ({ input, context }) => {
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
      const result = await deps.projectHandlers.setNextAction(command);
      return result.match(
        ({ view, task }) => ({
          project: toContractProject(view),
          ...(task ? { task: { id: task.id, title: task.title } } : {}),
        }),
        (error) => {
          throw mapSetNextActionError(error);
        }
      );
    }),
    confirmProposal: projects.confirmProposal.handler(async ({ input, context }) => {
      const result = await deps.projectHandlers.confirmProposal({
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
          project: toContractProject(view),
          ...(task ? { task: { id: task.id, title: task.title } } : {}),
        }),
        (error) => {
          throw mapConfirmProposalError(error);
        }
      );
    }),
    declineProposal: projects.declineProposal.handler(async ({ input, context }) => {
      const result = await deps.projectHandlers.declineProposal({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });
      return result.match(
        ({ view }) => toContractProject(view),
        (error) => {
          throw mapDeclineProposalError(error);
        }
      );
    }),
    restoreProposal: projects.restoreProposal.handler(async ({ input, context }) => {
      const result = await deps.projectHandlers.restoreProposal({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });
      return result.match(
        ({ view }) => toContractProject(view),
        (error) => {
          throw mapRestoreProposalError(error);
        }
      );
    }),
    listImports: projects.listImports.handler(async ({ context }) => {
      const result = await deps.projectHandlers.listImports({
        organizationId: context.request.authContext.organizationId,
      });
      return result.match(
        (body) => ({ imports: body.imports.map(toContractStagedImport) }),
        (error) => {
          throw mapListImportsError(error);
        }
      );
    }),
    getImport: projects.getImport.handler(async ({ input, context }) => {
      const result = await deps.projectHandlers.getImport({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        createdById: context.request.authContext.userId,
        actor: context.request.authContext.actor,
      });
      return result.match(
        (view) => toContractStagedImport(view),
        (error) => {
          throw mapGetImportError(error);
        }
      );
    }),
    applyImport: projects.applyImport.handler(async ({ input, context }) => {
      const result = await deps.projectHandlers.applyImport({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });
      return result.match(
        (view) => toContractAppliedImport(view),
        (error) => {
          throw mapApplyImportError(error);
        }
      );
    }),
    discardImport: projects.discardImport.handler(async ({ input, context }) => {
      const result = await deps.projectHandlers.discardImport({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });
      return result.match(
        (view) => toContractDiscardedImport(view),
        (error) => {
          throw mapDiscardImportError(error);
        }
      );
    }),
  });
};
