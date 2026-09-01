import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { UncompleteTaskCommand } from '../domain/task-commands.js';
import type { UncompleteTaskError } from '../domain/task-errors.js';
import type { TaskUncompleted } from '../domain/events.js';
import { decideUncompleteTask } from '../domain/decide-uncomplete.js';
import { applyTaskEvent } from '../domain/apply-task-event.js';
import { loadOwnedTask } from './load-owned-task.js';
import type { LoadOpenTasksInPile, LoadTask, PersistTaskEvent } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandleUncompleteTaskDeps = {
  load: LoadTask;
  loadOpenInPile: LoadOpenTasksInPile;
  persist: PersistTaskEvent;
};

export const handleUncompleteTask = (
  command: UncompleteTaskCommand,
  deps: HandleUncompleteTaskDeps
): ResultAsync<WriteResult<TaskUncompleted>, UncompleteTaskError> => {
  return loadOwnedTask({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    return deps
      .loadOpenInPile(command.organizationId, current.listId ?? null)
      .andThen((openInPile) => {
        const openSiblings = openInPile.filter((task) => task.id !== current.id);
        const decision = decideUncompleteTask({
          current,
          command,
          openSiblings,
        });

        if (decision.isErr()) {
          return errAsync(decision.error);
        }

        if (decision.value.type === 'Noop') {
          return okAsync({ event: null, view: current });
        }

        const event = decision.value;
        return deps.persist({ event, current }).map(() => ({
          event,
          view: applyTaskEvent(current, event),
        }));
      });
  });
};
