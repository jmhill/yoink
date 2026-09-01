import { ok, type Result } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { UncompleteTaskCommand } from './task-commands.js';
import type { Noop, TaskUncompleted } from './events.js';
import { insertAtRememberedIndex } from './open-order.js';

export type DecideUncompleteTaskInput = {
  current: Task;
  command: UncompleteTaskCommand;
  /** Currently open tasks in the same pile, excluding this task. */
  openSiblings: Task[];
};

export const decideUncompleteTask = ({
  current,
  openSiblings,
}: DecideUncompleteTaskInput): Result<TaskUncompleted | Noop, never> => {
  if (!current.completedAt) {
    return ok({ type: 'Noop' });
  }

  const { openOrder, siblingOrders } = insertAtRememberedIndex(
    current.openOrder,
    openSiblings
  );

  return ok({
    type: 'TaskUncompleted',
    id: current.id,
    openOrder,
    siblingOrders,
  });
};
