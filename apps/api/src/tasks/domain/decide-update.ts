import { err, ok, type Result } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { UpdateTaskCommand } from './task-commands.js';
import type { Noop, TaskUpdated } from './events.js';
import {
  assigneeNotInOrganizationError,
  listNotInOrganizationError,
  taskNotOpenError,
  type AssigneeNotInOrganizationError,
  type ListNotInOrganizationError,
  type TaskNotOpenError,
} from './task-errors.js';

export type DecideUpdateTaskInput = {
  current: Task;
  command: UpdateTaskCommand;
  /** Loaded list when command.listId is a change; null if missing or not loaded. */
  list: { id: string; organizationId: string } | null;
  /**
   * Whether command.assigneeId (when a principal id) is in the org.
   * Null when assignee is omitted or being cleared.
   */
  assigneeInOrganization: boolean | null;
};

export type DecideUpdateTaskError =
  | ListNotInOrganizationError
  | AssigneeNotInOrganizationError
  | TaskNotOpenError;

const hasOtherFieldChanges = (command: UpdateTaskCommand): boolean =>
  command.title !== undefined ||
  command.dueDate !== undefined ||
  command.assigneeId !== undefined;

export const decideUpdateTask = ({
  current,
  command,
  list,
  assigneeInOrganization,
}: DecideUpdateTaskInput): Result<TaskUpdated | Noop, DecideUpdateTaskError> => {
  let listId: string | undefined;

  if (command.listId !== undefined) {
    if (command.listId === current.listId) {
      listId = undefined;
    } else {
      if (current.completedAt) {
        return err(taskNotOpenError(command.id));
      }
      if (
        !list ||
        list.id !== command.listId ||
        list.organizationId !== command.organizationId
      ) {
        return err(listNotInOrganizationError(command.listId, command.organizationId));
      }
      listId = command.listId;
    }
  }

  if (command.assigneeId !== undefined && command.assigneeId !== null) {
    if (assigneeInOrganization !== true) {
      return err(
        assigneeNotInOrganizationError(command.assigneeId, command.organizationId)
      );
    }
  }

  if (listId === undefined && !hasOtherFieldChanges(command)) {
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
  });
};
