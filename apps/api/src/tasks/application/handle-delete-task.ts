import { errAsync, type ResultAsync } from 'neverthrow';
import type { DeleteTaskCommand } from '../domain/task-commands.js';
import type { DeleteTaskError } from '../domain/task-errors.js';
import type { TaskDeleted } from '../domain/events.js';
import { decideDeleteTask } from '../domain/decide-delete.js';
import { loadOwnedTask } from './load-owned-task.js';
import type { LoadTask, PersistTaskEvent } from './ports.js';

export type HandleDeleteTaskDeps = {
  load: LoadTask;
  persist: PersistTaskEvent;
  now: () => string;
};

export type DeleteTaskResult = {
  event: TaskDeleted;
};

export const handleDeleteTask = (
  command: DeleteTaskCommand,
  deps: HandleDeleteTaskDeps
): ResultAsync<DeleteTaskResult, DeleteTaskError> => {
  return loadOwnedTask({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const now = deps.now();
    const actor = command.actor ?? null;
    const decision = decideDeleteTask({ current, command, now });

    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    const event = decision.value;
    return deps.persist({ event, current, actor, now }).map(() => ({ event }));
  });
};
