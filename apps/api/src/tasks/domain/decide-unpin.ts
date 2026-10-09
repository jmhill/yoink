import { ok, type Result } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { UnpinTaskCommand } from './task-commands.js';
import type { Noop, TaskUnpinned } from './events.js';

export type DecideUnpinTaskInput = {
  current: Task;
  command: UnpinTaskCommand;
};

export const decideUnpinTask = ({
  current,
}: DecideUnpinTaskInput): Result<TaskUnpinned | Noop, never> => {
  if (!current.pinnedAt) {
    return ok({ type: 'Noop' });
  }

  return ok({
    type: 'TaskUnpinned',
    id: current.id,
    organizationId: current.organizationId,
  });
};
