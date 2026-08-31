import { err, ok, type Result } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { UpdateTaskCommand } from './task-commands.js';
import type { TaskUpdated } from './events.js';
import {
  assigneeNotInOrganizationError,
  listNotInOrganizationError,
  type AssigneeNotInOrganizationError,
  type ListNotInOrganizationError,
} from './task-errors.js';

export type DecideUpdateTaskInput = {
  current: Task;
  command: UpdateTaskCommand;
  /** Loaded list when command.listId is set; null if missing or not loaded. */
  list: { id: string; organizationId: string } | null;
  /**
   * Whether command.assigneeId (when a principal id) is in the org.
   * Null when assignee is omitted or being cleared.
   */
  assigneeInOrganization: boolean | null;
};

export type DecideUpdateTaskError = ListNotInOrganizationError | AssigneeNotInOrganizationError;

export const decideUpdateTask = ({
  command,
  list,
  assigneeInOrganization,
}: DecideUpdateTaskInput): Result<TaskUpdated, DecideUpdateTaskError> => {
  if (command.listId !== undefined) {
    if (
      !list ||
      list.id !== command.listId ||
      list.organizationId !== command.organizationId
    ) {
      return err(listNotInOrganizationError(command.listId, command.organizationId));
    }
  }

  if (command.assigneeId !== undefined && command.assigneeId !== null) {
    if (assigneeInOrganization !== true) {
      return err(
        assigneeNotInOrganizationError(command.assigneeId, command.organizationId)
      );
    }
  }

  return ok({
    type: 'TaskUpdated',
    id: command.id,
    organizationId: command.organizationId,
    title: command.title,
    dueDate: command.dueDate,
    assigneeId: command.assigneeId,
    listId: command.listId,
  });
};
