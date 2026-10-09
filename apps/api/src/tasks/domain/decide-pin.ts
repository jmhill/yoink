import { ok, type Result } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { PinTaskCommand } from './task-commands.js';
import type { Noop, TaskPinned } from './events.js';

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
  });
};
