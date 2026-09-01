import { err, ok, type Result } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ReorderOpenTasksCommand } from './list-commands.js';
import {
  invalidOpenOrderError,
  listNotFoundError,
  taskNotOpenError,
  type InvalidOpenOrderError,
  type ListNotFoundError,
  type TaskNotOpenError,
} from './list-errors.js';

export type OpenTasksReordered = {
  type: 'OpenTasksReordered';
  listId: string;
  organizationId: string;
  orders: { id: string; openOrder: number }[];
};

export type DecideReorderOpenTasksInput = {
  command: ReorderOpenTasksCommand;
  list: { id: string; organizationId: string } | null;
  openTasks: Task[];
  extraTasks: Task[];
};

export type DecideReorderOpenTasksError =
  | ListNotFoundError
  | TaskNotOpenError
  | InvalidOpenOrderError;

export const decideReorderOpenTasks = ({
  command,
  list,
  openTasks,
  extraTasks,
}: DecideReorderOpenTasksInput): Result<
  OpenTasksReordered,
  DecideReorderOpenTasksError
> => {
  if (!list || list.id !== command.listId || list.organizationId !== command.organizationId) {
    return err(listNotFoundError(command.listId));
  }

  const completedOnList = extraTasks.find(
    (task) =>
      Boolean(task.completedAt) &&
      task.listId === command.listId &&
      task.organizationId === command.organizationId
  );
  if (completedOnList) {
    return err(taskNotOpenError(completedOnList.id));
  }

  const openIds = new Set(openTasks.map((task) => task.id));
  const requested = command.taskIds;
  if (
    requested.length !== openTasks.length ||
    new Set(requested).size !== requested.length ||
    requested.some((id) => !openIds.has(id))
  ) {
    return err(invalidOpenOrderError());
  }

  return ok({
    type: 'OpenTasksReordered',
    listId: command.listId,
    organizationId: command.organizationId,
    orders: requested.map((id, openOrder) => ({ id, openOrder })),
  });
};
