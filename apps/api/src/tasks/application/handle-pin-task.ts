import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { PinTaskCommand } from '../domain/task-commands.js';
import type { PinTaskError } from '../domain/task-errors.js';
import type { TaskPinned } from '../domain/events.js';
import { storageError } from '../domain/task-errors.js';
import { decidePinTask } from '../domain/decide-pin.js';
import { planTaskChange } from '../domain/plan-task-change.js';
import { loadOwnedTask } from './load-owned-task.js';
import type { LoadTask, PersistTaskChange } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandlePinTaskDeps = {
  load: LoadTask;
  persist: PersistTaskChange;
  nextId: () => string;
  now: () => string;
};

export const handlePinTask = (
  command: PinTaskCommand,
  deps: HandlePinTaskDeps
): ResultAsync<WriteResult<TaskPinned>, PinTaskError> => {
  return loadOwnedTask({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const now = deps.now();
    const decision = decidePinTask({ current, command, now });

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
      return errAsync(storageError('Pin did not project a task'));
    }
    return deps.persist(plan).map(() => ({
      event,
      view: plan.view,
    }));
  });
};
