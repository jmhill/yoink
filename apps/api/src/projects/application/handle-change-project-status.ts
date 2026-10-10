import { err, errAsync, ok, okAsync, type Result, type ResultAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';
import type { ChangeProjectStatusCommand } from '../domain/project-commands.js';
import {
  projectNotFoundError,
  storageError,
  type ChangeProjectStatusError,
} from '../domain/project-errors.js';
import { decideChangeProjectStatus } from '../domain/decide-change-status.js';
import { planProjectChange } from '../domain/plan-project-change.js';
import { decideCompleteTask } from '../../tasks/domain/decide-complete.js';
import { decideUpdateTask } from '../../tasks/domain/decide-update.js';
import { changeLogIdsForTaskUpdated } from '../../tasks/domain/change-log-records.js';
import { planTaskChange, type TaskChangePlan } from '../../tasks/domain/plan-task-change.js';
import type {
  LoadProject,
  PageOpenTasksOnProject,
  PersistProjectStatusChange,
} from './ports.js';

const OPEN_TASKS_FETCH_LIMIT = 1000;

export type HandleChangeProjectStatusDeps = {
  load: LoadProject;
  pageOpenTasksOnProject: PageOpenTasksOnProject;
  persistStatus: PersistProjectStatusChange;
  nextId: () => string;
  now: () => string;
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
        ? deps.pageOpenTasksOnProject({
            organizationId: command.organizationId,
            projectId: command.id,
            fetchLimit: OPEN_TASKS_FETCH_LIMIT,
          })
        : okAsync({ rows: [] as Task[], total: 0 });

    return openTasks.andThen((page) => {
      const now = deps.now();
      const decision = decideChangeProjectStatus({
        project: loaded,
        openTaskCount: page.total,
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

      const projectPlan = planProjectChange({
        event: decision.value.event,
        current: loaded,
        actor: command.actor,
        ids: { recordId: deps.nextId() },
      });

      const taskPlans = taskPlansForOpenTasks({
        choice: command.status === 'done' ? command.openTasks : undefined,
        tasks: page.rows,
        command,
        now,
        nextId: deps.nextId,
      });

      if (taskPlans.isErr()) {
        return errAsync(taskPlans.error);
      }

      return deps.persistStatus({ project: projectPlan, tasks: taskPlans.value }).map(() => ({
        view: projectPlan.view,
        eventKinds: [
          ...taskPlans.value.flatMap((plan) => plan.records.map((record) => record.kind)),
          ...projectPlan.records.map((record) => record.kind),
        ],
        completedTaskCount: command.openTasks === 'complete' ? page.rows.length : 0,
        removedTaskCount: command.openTasks === 'remove' ? page.rows.length : 0,
      }));
    });
  });
};

const taskPlansForOpenTasks = (input: {
  choice: 'complete' | 'remove' | undefined;
  tasks: readonly Task[];
  command: ChangeProjectStatusCommand;
  now: string;
  nextId: () => string;
}): Result<TaskChangePlan[], ChangeProjectStatusError> => {
  if (input.choice === undefined || input.tasks.length === 0) {
    return ok([]);
  }

  const plans: TaskChangePlan[] = [];

  for (const task of input.tasks) {
    if (input.choice === 'complete') {
      const decision = decideCompleteTask({
        current: task,
        command: {
          id: task.id,
          organizationId: input.command.organizationId,
          actor: input.command.actor,
        },
        now: input.now,
      });
      if (decision.isErr()) {
        return err(storageError('Failed to plan task completion', decision.error));
      }
      if (decision.value.type === 'Noop') {
        continue;
      }
      plans.push(
        planTaskChange({
          event: decision.value,
          current: task,
          actor: input.command.actor,
          ids: { recordId: input.nextId() },
        })
      );
      continue;
    }

    const decision = decideUpdateTask({
      current: task,
      command: {
        id: task.id,
        organizationId: input.command.organizationId,
        projectId: null,
        actor: input.command.actor,
      },
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: task.openOrder ?? 0,
      now: input.now,
    });
    if (decision.isErr()) {
      return err(storageError('Failed to plan task removal from project', decision.error));
    }
    if (decision.value.type === 'Noop') {
      continue;
    }
    plans.push(
      planTaskChange({
        event: decision.value,
        current: task,
        actor: input.command.actor,
        ids: changeLogIdsForTaskUpdated(decision.value, task, input.nextId),
      })
    );
  }

  return ok(plans);
};
