import { errAsync, type ResultAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';
import { decideCreateTask } from '../../tasks/domain/decide-create.js';
import { planTaskChange } from '../../tasks/domain/plan-task-change.js';
import type { OrgPrincipalLookup } from '../../tasks/domain/org-principal-lookup.js';
import type { ConfirmProposedProjectCommand } from '../domain/project-commands.js';
import {
  openTaskPlanFailedError,
  projectDoneError,
  projectNotFoundError,
  type ConfirmProposedProjectError,
} from '../domain/project-errors.js';
import { decideConfirmProposal } from '../domain/decide-confirm-proposal.js';
import { decideSetNextAction } from '../domain/decide-set-next-action.js';
import { mergeProjectUpdatePlans, planProjectChange } from '../domain/plan-project-change.js';
import { heldProjectNames } from '../domain/project-status-filter.js';
import type {
  ListProjects,
  LoadNextOpenOrder,
  LoadProject,
  PersistProjectStatusChange,
} from './ports.js';

export type HandleConfirmProposalDeps = {
  load: LoadProject;
  list: ListProjects;
  loadNextOpenOrder: LoadNextOpenOrder;
  persistStatus: PersistProjectStatusChange;
  principalLookup?: OrgPrincipalLookup;
  nextId: () => string;
  now: () => string;
};

export type ConfirmProposalResult = {
  view: Project;
  task?: Task;
  eventKinds: ChangeLogKind[];
};

export const handleConfirmProposal = (
  command: ConfirmProposedProjectCommand,
  deps: HandleConfirmProposalDeps
): ResultAsync<ConfirmProposalResult, ConfirmProposedProjectError> => {
  return deps.load(command.id).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== command.organizationId) {
      return errAsync(projectNotFoundError(command.id));
    }

    return deps.list(command.organizationId).andThen((existing) => {
      const now = deps.now();
      const decision = decideConfirmProposal({
        project: loaded,
        command,
        existingNames: heldProjectNames(existing),
        now,
      });
      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      const updatePlan = decision.value.updated
        ? planProjectChange({
            event: decision.value.updated,
            current: loaded,
            actor: command.actor,
            ids: { recordId: deps.nextId() },
          })
        : null;

      const afterUpdate = updatePlan?.view ?? loaded;
      const statusPlan = planProjectChange({
        event: decision.value.statusChanged,
        current: afterUpdate,
        actor: command.actor,
        ids: { recordId: deps.nextId() },
      });
      const projectPlan = updatePlan
        ? mergeProjectUpdatePlans(updatePlan, statusPlan)
        : statusPlan;

      const title = decision.value.suggestedNextAction;
      if (title === undefined) {
        return deps.persistStatus({ project: projectPlan, tasks: [] }).map(() => ({
          view: projectPlan.view,
          eventKinds: projectPlan.records.map((record) => record.kind),
        }));
      }

      return deps.loadNextOpenOrder(command.organizationId, null).andThen((nextOpenOrder) => {
        const createdId = deps.nextId();
        const createDecision = decideCreateTask({
          command: {
            title,
            organizationId: command.organizationId,
            createdById: command.actor.userId,
            projectId: projectPlan.view.id,
            actor: command.actor,
          },
          list: null,
          project: projectPlan.view,
          assigneeInOrganization: null,
          nextOpenOrder,
          id: createdId,
          now,
        });
        if (createDecision.isErr()) {
          if (createDecision.error.type === 'PROJECT_DONE') {
            return errAsync(projectDoneError(projectPlan.view.id));
          }
          return errAsync(openTaskPlanFailedError(createdId, createDecision.error));
        }

        const taskPlan = planTaskChange({
          event: createDecision.value,
          current: null,
          actor: command.actor,
          ids: { recordId: deps.nextId() },
        });

        const setDecision = decideSetNextAction({
          project: projectPlan.view,
          task: taskPlan.view,
          command: {
            type: 'set',
            id: command.id,
            organizationId: command.organizationId,
            taskId: taskPlan.view.id,
            actor: command.actor,
          },
          now,
        });
        if (setDecision.isErr()) {
          return errAsync(setDecision.error);
        }
        if (setDecision.value.type !== 'set') {
          return errAsync(openTaskPlanFailedError(taskPlan.view.id, setDecision.value));
        }

        const nextActionPlan = planProjectChange({
          event: setDecision.value.event,
          current: projectPlan.view,
          actor: command.actor,
          ids: { recordId: deps.nextId() },
        });

        const combined = {
          action: 'update' as const,
          organizationId: projectPlan.organizationId,
          projectId: projectPlan.projectId,
          view: nextActionPlan.view,
          records: [...projectPlan.records, ...nextActionPlan.records],
        };

        return deps
          .persistStatus({ project: combined, tasks: [taskPlan] })
          .map(() => ({
            view: combined.view,
            task: taskPlan.view,
            eventKinds: [
              ...combined.records.map((record) => record.kind),
              ...taskPlan.records.map((record) => record.kind),
            ],
          }));
      });
    });
  });
};
