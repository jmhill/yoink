import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { PinTaskCommand } from '../../domain/messages/task-commands.js';
import type { PinTaskError } from '../../domain/messages/task-errors.js';
import type { TaskPinned } from '../../domain/messages/task-events.js';
import { decidePinTask } from '../../domain/decisions/decide-pin.js';
import { planTaskChange } from '../../domain/projections/plan-task-change.js';
import { loadOwnedTask } from '../support/load-owned-task.js';
import type { LoadTask, PersistTaskChange } from '../ports.js';
import { kindsFromRecords, type WriteResult } from '../support/write-result.js';

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
      return okAsync({ event: null, view: current, eventKinds: [] });
    }

    const event = decision.value;
    const plan = planTaskChange({
      event,
      current,
      actor: command.actor,
      ids: { recordId: deps.nextId() },
    });
    return deps.persist(plan).map(() => ({
      event,
      view: plan.view,
      eventKinds: kindsFromRecords(plan.records),
    }));
  });
};
