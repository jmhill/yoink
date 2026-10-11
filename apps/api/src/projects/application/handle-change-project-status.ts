import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';
import type { ChangeProjectStatusCommand } from '../domain/project-commands.js';
import {
  projectNotFoundError,
  type ChangeProjectStatusError,
} from '../domain/project-errors.js';
import { decideChangeProjectStatus } from '../domain/decide-change-status.js';
import { mergeProjectUpdatePlans, planProjectChange } from '../domain/plan-project-change.js';
import { planOpenTasksForProjectDone } from '../domain/plan-open-tasks-for-done.js';
import { planNextActionClear } from './plan-next-action-clear.js';
import type {
  LoadProject,
  PageOpenTasksOnProject,
  PersistProjectStatusChange,
} from './ports.js';
import { collectAllOpenTasksOnProject } from './collect-open-tasks-on-project.js';

export const OPEN_TASKS_FETCH_LIMIT = 1000;

const EMPTY_TASKS: Task[] = [];

export type HandleChangeProjectStatusDeps = {
  load: LoadProject;
  pageOpenTasksOnProject: PageOpenTasksOnProject;
  persistStatus: PersistProjectStatusChange;
  nextId: () => string;
  now: () => string;
  openTasksFetchLimit?: number;
};

export type ChangeProjectStatusResult = {
  view: Project;
  eventKinds: ChangeLogKind[];
  completedTaskCount: number;
  removedTaskCount: number;
};

export const handleChangeProjectStatus = (
  command: ChangeProjectStatusCommand,
  deps: HandleChangeProjectStatusDeps
): ResultAsync<ChangeProjectStatusResult, ChangeProjectStatusError> => {
  return deps.load(command.id).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== command.organizationId) {
      return errAsync(projectNotFoundError(command.id));
    }

    const openTasks =
      command.status === 'done'
        ? collectAllOpenTasksOnProject({
            page: deps.pageOpenTasksOnProject,
            organizationId: command.organizationId,
            projectId: command.id,
            fetchLimit: deps.openTasksFetchLimit ?? OPEN_TASKS_FETCH_LIMIT,
          })
        : okAsync(EMPTY_TASKS);

    return openTasks.andThen((tasks) => {
      const now = deps.now();
      const decision = decideChangeProjectStatus({
        project: loaded,
        openTaskCount: tasks.length,
        command,
        now,
      });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      if (decision.value.type === 'unchanged') {
        return okAsync({
          view: loaded,
          eventKinds: [],
          completedTaskCount: 0,
          removedTaskCount: 0,
        });
      }

      const statusPlan = planProjectChange({
        event: decision.value.event,
        current: loaded,
        actor: command.actor,
        ids: { recordId: deps.nextId() },
      });

      const taskPlans = planOpenTasksForProjectDone({
        choice: command.status === 'done' ? command.openTasks : undefined,
        tasks,
        command,
        now,
        nextId: deps.nextId,
      });

      if (taskPlans.isErr()) {
        return errAsync(taskPlans.error);
      }

      const clearPlan =
        command.status === 'done'
          ? planNextActionClear({
              project: statusPlan.view,
              change: {
                type: 'projectDone',
                taskIds: tasks.map((task) => task.id),
              },
              actor: command.actor,
              now,
              recordId: deps.nextId(),
            })
          : null;

      const projectPlan =
        clearPlan && statusPlan.action === 'update' && clearPlan.action === 'update'
          ? mergeProjectUpdatePlans(statusPlan, clearPlan)
          : statusPlan;

      return deps.persistStatus({ project: projectPlan, tasks: taskPlans.value }).map(() => ({
        view: projectPlan.view,
        eventKinds: [
          ...taskPlans.value.flatMap((plan) => plan.records.map((record) => record.kind)),
          ...projectPlan.records.map((record) => record.kind),
        ],
        completedTaskCount: countPlansByKind(taskPlans.value, 'TaskCompleted'),
        removedTaskCount: countPlansByKind(taskPlans.value, 'TaskRemovedFromProject'),
      }));
    });
  });
};

const countPlansByKind = (
  plans: readonly { records: readonly { kind: string }[] }[],
  kind: string
): number => plans.filter((plan) => plan.records.some((record) => record.kind === kind)).length;
