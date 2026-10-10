import { err, ok, type Result } from 'neverthrow';
import type { CreateTaskCommand, LoadedProject } from './task-commands.js';
import type { TaskCreated } from './events.js';
import {
  assigneeNotInOrganizationError,
  listNotInOrganizationError,
  projectDoneError,
  projectNotInOrganizationError,
  type AssigneeNotInOrganizationError,
  type ListNotInOrganizationError,
  type ProjectDoneError,
  type ProjectNotInOrganizationError,
} from './task-errors.js';

export type DecideCreateTaskInput = {
  command: CreateTaskCommand;
  /** Loaded list when command.listId is set; null if omitted, missing, or not in org. */
  list: { id: string; organizationId: string } | null;
  /** Loaded project when command.projectId is set; null if omitted, missing, or not in org. */
  project: LoadedProject | null;
  /**
   * Whether command.assigneeId is in the org.
   * Null when assignee is omitted.
   */
  assigneeInOrganization: boolean | null;
  /** Next open-order index in the destination pile (that list, or unlisted). */
  nextOpenOrder: number;
  id: string;
  now: string;
};

export type DecideCreateTaskError =
  | ListNotInOrganizationError
  | AssigneeNotInOrganizationError
  | ProjectNotInOrganizationError
  | ProjectDoneError;

const projectForCreate = (
  command: CreateTaskCommand,
  project: LoadedProject | null
): Result<string | undefined, ProjectNotInOrganizationError | ProjectDoneError> => {
  if (command.projectId === undefined) {
    return ok(undefined);
  }
  if (
    !project ||
    project.id !== command.projectId ||
    project.organizationId !== command.organizationId
  ) {
    return err(projectNotInOrganizationError(command.projectId, command.organizationId));
  }
  if (project.status === 'done') {
    return err(projectDoneError(command.projectId));
  }
  return ok(command.projectId);
};

export const decideCreateTask = ({
  command,
  list,
  project,
  assigneeInOrganization,
  nextOpenOrder,
  id,
  now,
}: DecideCreateTaskInput): Result<TaskCreated, DecideCreateTaskError> => {
  if (command.listId !== undefined) {
    if (
      !list ||
      list.id !== command.listId ||
      list.organizationId !== command.organizationId
    ) {
      return err(listNotInOrganizationError(command.listId, command.organizationId));
    }
  }

  const projectDecision = projectForCreate(command, project);
  if (projectDecision.isErr()) {
    return err(projectDecision.error);
  }

  if (command.assigneeId !== undefined) {
    if (assigneeInOrganization !== true) {
      return err(
        assigneeNotInOrganizationError(command.assigneeId, command.organizationId)
      );
    }
  }

  return ok({
    type: 'TaskCreated',
    id,
    organizationId: command.organizationId,
    createdById: command.createdById,
    title: command.title,
    dueDate: command.dueDate,
    captureId: command.captureId,
    assigneeId: command.assigneeId,
    listId: command.listId,
    projectId: projectDecision.value,
    openOrder: nextOpenOrder,
    createdAt: now,
    occurredAt: now,
  });
};
