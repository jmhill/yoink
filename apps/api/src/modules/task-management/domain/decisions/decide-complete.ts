import type { Task } from '../model/task.js';
import { ok, type Result } from 'neverthrow';

import type { CompleteTaskCommand } from '../messages/task-commands.js';
import type { Noop, TaskCompleted } from '../messages/task-events.js';

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
    organizationId: current.organizationId,
    completedAt: now,
    occurredAt: now,
  });
};
