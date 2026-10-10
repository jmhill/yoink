import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { UncompleteTaskCommand } from '../domain/task-commands.js';
import type { UncompleteTaskError } from '../domain/task-errors.js';
import type { TaskUncompleted } from '../domain/events.js';
import { decideUncompleteTask } from '../domain/decide-uncomplete.js';
import { planTaskChange } from '../domain/plan-task-change.js';
import { loadOwnedTask } from './load-owned-task.js';
import type { LoadOpenTasksInPile, LoadTask, PersistTaskChange } from './ports.js';
import { kindsFromRecords, type WriteResult } from './write-result.js';

export type HandleUncompleteTaskDeps = {
  load: LoadTask;
  loadOpenInPile: LoadOpenTasksInPile;
  persist: PersistTaskChange;
  nextId: () => string;
  now: () => string;
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
        const now = deps.now();
        const openSiblings = openInPile.filter((task) => task.id !== current.id);
        const decision = decideUncompleteTask({
          current,
          command,
          openSiblings,
          now,
        });

        if (decision.isErr()) {
          return errAsync(decision.error);
        }

        if (decision.value.type === 'Noop') {
          return okAsync({ event: null, view: current, eventKinds: [] });
        }

        const event = decision.value;
        const plan = planTaskChange({
          event,
          current,
          actor: command.actor,
          ids: {
            recordId: deps.nextId(),
            renumberRecordId: deps.nextId(),
          },
        });
        return deps.persist(plan).map(() => ({
          event,
          view: plan.view,
          eventKinds: kindsFromRecords(plan.records),
        }));
      });
  });
};
