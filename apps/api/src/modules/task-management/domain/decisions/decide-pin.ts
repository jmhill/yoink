import type { Task } from '../model/task.js';
import { ok, type Result } from 'neverthrow';

import type { PinTaskCommand } from '../messages/task-commands.js';
import type { Noop, TaskPinned } from '../messages/task-events.js';

export type DecidePinTaskInput = {
  current: Task;
  command: PinTaskCommand;
  now: string;
};

export const decidePinTask = ({
  current,
  now,
}: DecidePinTaskInput): Result<TaskPinned | Noop, never> => {
  if (current.pinnedAt) {
    return ok({ type: 'Noop' });
  }

  return ok({
    type: 'TaskPinned',
    id: current.id,
    organizationId: current.organizationId,
    pinnedAt: now,
    occurredAt: now,
  });
};
