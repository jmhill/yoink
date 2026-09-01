import { ok, type Result } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { CompleteTaskCommand } from './task-commands.js';
import type { Noop, TaskCompleted } from './events.js';

export type DecideCompleteTaskInput = {
  current: Task;
  command: CompleteTaskCommand;
  now: string;
};

export const decideCompleteTask = ({
  current,
  now,
}: DecideCompleteTaskInput): Result<TaskCompleted | Noop, never> => {
  if (current.completedAt) {
    return ok({ type: 'Noop' });
  }

  return ok({
    type: 'TaskCompleted',
    id: current.id,
    completedAt: now,
  });
};
