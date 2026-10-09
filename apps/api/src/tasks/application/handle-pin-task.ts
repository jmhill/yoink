import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { PinTaskCommand } from '../domain/task-commands.js';
import type { PinTaskError } from '../domain/task-errors.js';
import type { TaskPinned } from '../domain/events.js';
import { decidePinTask } from '../domain/decide-pin.js';
import { applyTaskEvent } from '../domain/apply-task-event.js';
import { loadOwnedTask } from './load-owned-task.js';
import type { LoadTask, PersistTaskEvent } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandlePinTaskDeps = {
  load: LoadTask;
  persist: PersistTaskEvent;
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
    const actor = command.actor ?? null;
    const decision = decidePinTask({ current, command, now });

    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    if (decision.value.type === 'Noop') {
      return okAsync({ event: null, view: current });
    }

    const event = decision.value;
    return deps.persist({ event, current, actor, now }).map(() => ({
      event,
      view: applyTaskEvent(current, event, {
        now,
        actorUserId: actor?.userId ?? null,
      }),
    }));
  });
};
