import { err, ok, type Result } from 'neverthrow';
import type { CreateTaskCommand } from './task-commands.js';
import type { TaskCreated } from './events.js';
import {
  assigneeNotInOrganizationError,
  listNotInOrganizationError,
  type AssigneeNotInOrganizationError,
  type ListNotInOrganizationError,
} from './task-errors.js';

export type DecideCreateTaskInput = {
  command: CreateTaskCommand;
  /** Loaded list when command.listId is set; null if omitted, missing, or not in org. */
  list: { id: string; organizationId: string } | null;
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
  | AssigneeNotInOrganizationError;

export const decideCreateTask = ({
  command,
  list,
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
    openOrder: nextOpenOrder,
    createdAt: now,
  });
};
