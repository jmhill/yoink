import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { UnpinTaskCommand } from '../../domain/messages/task-commands.js';
import type { UnpinTaskError } from '../../domain/messages/task-errors.js';
import type { TaskUnpinned } from '../../domain/messages/task-events.js';
import { decideUnpinTask } from '../../domain/decisions/decide-unpin.js';
import { planTaskChange } from '../../domain/projections/plan-task-change.js';
import { loadOwnedTask } from '../support/load-owned-task.js';
import type { LoadTask, PersistTaskChange } from '../ports.js';
import { kindsFromRecords, type WriteResult } from '../support/write-result.js';

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
