import { err, ok, type Result } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import type { SetProjectNextActionCommand } from './project-commands.js';
import type { ProjectNextActionCleared, ProjectNextActionSet } from './events.js';
import {
  projectDoneError,
  taskNotFoundError,
  taskNotInProjectError,
  taskNotOpenError,
  type SetProjectNextActionError,
} from './project-errors.js';

export type DecideSetNextActionInput = {
  project: Project;
  task: Task | null;
  command: Extract<SetProjectNextActionCommand, { type: 'set' | 'clear' }>;
  now: string;
};

export type DecideSetNextActionResult =
  | { type: 'unchanged' }
  | { type: 'set'; event: ProjectNextActionSet }
  | { type: 'cleared'; event: ProjectNextActionCleared };

export const decideSetNextAction = ({
  project,
  task,
  command,
  now,
}: DecideSetNextActionInput): Result<DecideSetNextActionResult, SetProjectNextActionError> => {
  if (command.type === 'clear') {
    if (!project.nextActionTaskId) {
      return ok({ type: 'unchanged' });
    }
    return ok({
      type: 'cleared',
      event: {
        type: 'ProjectNextActionCleared',
        id: project.id,
        organizationId: project.organizationId,
        taskId: project.nextActionTaskId,
        reason: 'cleared',
        occurredAt: now,
      },
    });
  }

  if (
    !task ||
    task.id !== command.taskId ||
    task.organizationId !== project.organizationId
  ) {
    return err(taskNotFoundError(command.taskId));
  }

  if (project.status === 'done') {
    return err(projectDoneError(project.id));
  }

  if (task.completedAt) {
    return err(taskNotOpenError(task.id));
  }

  if (task.projectId !== project.id) {
    return err(taskNotInProjectError(task.id, project.id));
  }

  if (project.nextActionTaskId === task.id) {
    return ok({ type: 'unchanged' });
  }

  return ok({
    type: 'set',
    event: {
      type: 'ProjectNextActionSet',
      id: project.id,
      organizationId: project.organizationId,
      taskId: task.id,
      previousTaskId: project.nextActionTaskId,
      occurredAt: now,
    },
  });
};
