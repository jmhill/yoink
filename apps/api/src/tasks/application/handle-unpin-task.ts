import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { UnpinTaskCommand } from '../domain/task-commands.js';
import type { UnpinTaskError } from '../domain/task-errors.js';
import type { TaskUnpinned } from '../domain/events.js';
import { storageError } from '../domain/task-errors.js';
import { decideUnpinTask } from '../domain/decide-unpin.js';
import { planTaskChange } from '../domain/plan-task-change.js';
import { loadOwnedTask } from './load-owned-task.js';
import type { LoadTask, PersistTaskChange } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandleUnpinTaskDeps = {
  load: LoadTask;
  persist: PersistTaskChange;
  nextId: () => string;
  now: () => string;
};

export const handleUnpinTask = (
  command: UnpinTaskCommand,
  deps: HandleUnpinTaskDeps
): ResultAsync<WriteResult<TaskUnpinned>, UnpinTaskError> => {
  return loadOwnedTask({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const now = deps.now();
    const decision = decideUnpinTask({ current, command, now });

    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    if (decision.value.type === 'Noop') {
      return okAsync({ event: null, view: current });
    }

    const event = decision.value;
    const plan = planTaskChange({
      event,
      current,
      actor: command.actor,
      ids: [deps.nextId(), deps.nextId()],
    });
    if (plan.action === 'delete') {
      return errAsync(storageError('Unpin did not project a task'));
    }
    return deps.persist(plan).map(() => ({
      event,
      view: plan.view,
    }));
  });
};
