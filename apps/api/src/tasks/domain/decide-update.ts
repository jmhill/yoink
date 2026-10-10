import { err, ok, type Result } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { LoadedProject, UpdateTaskCommand } from './task-commands.js';
import type { Noop, TaskUpdated } from './events.js';
import {
  assigneeNotInOrganizationError,
  listNotInOrganizationError,
  projectDoneError,
  projectNotInOrganizationError,
  taskNotOpenError,
  type AssigneeNotInOrganizationError,
  type ListNotInOrganizationError,
  type ProjectDoneError,
  type ProjectNotInOrganizationError,
  type TaskNotOpenError,
} from './task-errors.js';

export type DecideUpdateTaskInput = {
  current: Task;
  command: UpdateTaskCommand;
  /** Loaded list when command.listId is a uuid change; null if missing, not loaded, or clearing. */
  list: { id: string; organizationId: string } | null;
  /** Loaded project when command.projectId is a uuid change; null if missing, not loaded, or clearing. */
  project: LoadedProject | null;
  /**
   * Whether command.assigneeId (when a principal id) is in the org.
   * Null when assignee is omitted or being cleared.
   */
  assigneeInOrganization: boolean | null;
  /** Next open-order index in the destination pile when listId changes. */
  nextOpenOrder: number;
  now: string;
};

export type DecideUpdateTaskError =
  | ListNotInOrganizationError
  | AssigneeNotInOrganizationError
  | ProjectNotInOrganizationError
  | ProjectDoneError
  | TaskNotOpenError;

const hasOtherFieldChanges = (command: UpdateTaskCommand): boolean =>
  command.title !== undefined ||
  command.dueDate !== undefined ||
  command.assigneeId !== undefined;

const listForUpdate = (
  current: Task,
  command: UpdateTaskCommand,
  list: { id: string; organizationId: string } | null,
  nextOpenOrder: number
): Result<
  { listId?: string | null; openOrder?: number },
  ListNotInOrganizationError | TaskNotOpenError
> => {
  if (command.listId === undefined) {
    return ok({});
  }
  const currentListId = current.listId ?? null;
  if (command.listId === currentListId) {
    return ok({});
  }
  if (current.completedAt) {
    return err(taskNotOpenError(command.id));
  }
  if (command.listId === null) {
    return ok({ listId: null, openOrder: nextOpenOrder });
  }
  if (
    !list ||
    list.id !== command.listId ||
    list.organizationId !== command.organizationId
  ) {
    return err(listNotInOrganizationError(command.listId, command.organizationId));
  }
  return ok({ listId: command.listId, openOrder: nextOpenOrder });
};

const projectForUpdate = (
  current: Task,
  command: UpdateTaskCommand,
  project: LoadedProject | null
): Result<
  { projectId?: string | null },
  ProjectNotInOrganizationError | ProjectDoneError | TaskNotOpenError
> => {
  if (command.projectId === undefined) {
    return ok({});
  }
  const currentProjectId = current.projectId ?? null;
  if (command.projectId === currentProjectId) {
    return ok({});
  }
  if (current.completedAt) {
    return err(taskNotOpenError(command.id));
  }
  if (command.projectId === null) {
    return ok({ projectId: null });
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
  return ok({ projectId: command.projectId });
};

export const decideUpdateTask = ({
  current,
  command,
  list,
  project,
  assigneeInOrganization,
  nextOpenOrder,
  now,
}: DecideUpdateTaskInput): Result<TaskUpdated | Noop, DecideUpdateTaskError> => {
  const listDecision = listForUpdate(current, command, list, nextOpenOrder);
  if (listDecision.isErr()) {
    return err(listDecision.error);
  }

  const projectDecision = projectForUpdate(current, command, project);
  if (projectDecision.isErr()) {
    return err(projectDecision.error);
  }

  if (command.assigneeId !== undefined && command.assigneeId !== null) {
    if (assigneeInOrganization !== true) {
      return err(
        assigneeNotInOrganizationError(command.assigneeId, command.organizationId)
      );
    }
  }

  const { listId, openOrder } = listDecision.value;
  const { projectId } = projectDecision.value;

  if (listId === undefined && projectId === undefined && !hasOtherFieldChanges(command)) {
    return ok({ type: 'Noop' });
  }

  return ok({
    type: 'TaskUpdated',
    id: command.id,
    organizationId: command.organizationId,
    title: command.title,
    dueDate: command.dueDate,
    assigneeId: command.assigneeId,
    listId,
    projectId,
    openOrder,
    occurredAt: now,
  });
};
