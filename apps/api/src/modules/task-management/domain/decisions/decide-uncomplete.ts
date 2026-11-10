import type { Task } from '../model/task.js';
import { ok, type Result } from 'neverthrow';

import type { UncompleteTaskCommand } from '../messages/task-commands.js';
import type { Noop, TaskUncompleted } from '../messages/task-events.js';
import { insertAtRememberedIndex } from '../rules/open-order.js';

export type DecideUncompleteTaskInput = {
  current: Task;
  command: UncompleteTaskCommand;
  /** Currently open tasks in the same pile, excluding this task. */
  openSiblings: Task[];
  now: string;
};

export const decideUncompleteTask = ({
  current,
  openSiblings,
  now,
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
    organizationId: current.organizationId,
    openOrder,
    siblingOrders,
    occurredAt: now,
  });
};
