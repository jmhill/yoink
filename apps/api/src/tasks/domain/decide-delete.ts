import { ok, type Result } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { DeleteTaskCommand } from './task-commands.js';
import type { TaskDeleted } from './events.js';

export type DecideDeleteTaskInput = {
  current: Task;
  command: DeleteTaskCommand;
  now: string;
};

export const decideDeleteTask = ({
  current,
  now,
}: DecideDeleteTaskInput): Result<TaskDeleted, never> => {
  const event: TaskDeleted = {
    type: 'TaskDeleted',
    id: current.id,
    organizationId: current.organizationId,
    deletedAt: now,
  };
  if (current.captureId !== undefined) {
    event.captureId = current.captureId;
  }
  return ok(event);
};
