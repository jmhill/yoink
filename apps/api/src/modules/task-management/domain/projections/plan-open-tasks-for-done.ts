import type { Task } from '../model/task.js';
import { err, ok, type Result } from 'neverthrow';

import { decideCompleteTask } from '../decisions/decide-complete.js';
import { decideUpdateTask } from '../decisions/decide-update-task.js';
import { changeLogIdsForTaskUpdated } from './task-change-log-records.js';
import { planTaskChange, type TaskChangePlan } from './plan-task-change.js';
import type { ChangeProjectStatusCommand } from '../messages/project-commands.js';
import {
  openTaskPlanFailedError,
  type OpenTaskPlanFailedError,
} from '../messages/project-errors.js';

export const planOpenTasksForProjectDone = (input: {
  choice: 'complete' | 'remove' | undefined;
  tasks: readonly Task[];
  command: ChangeProjectStatusCommand;
  now: string;
  nextId: () => string;
}): Result<TaskChangePlan[], OpenTaskPlanFailedError> => {
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
        return err(openTaskPlanFailedError(task.id, decision.error));
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
      return err(openTaskPlanFailedError(task.id, decision.error));
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
