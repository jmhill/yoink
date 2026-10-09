import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { UnpinTaskCommand } from '../domain/task-commands.js';
import type { UnpinTaskError } from '../domain/task-errors.js';
import type { TaskUnpinned } from '../domain/events.js';
import { decideUnpinTask } from '../domain/decide-unpin.js';
import { applyTaskEvent } from '../domain/apply-task-event.js';
import { loadOwnedTask } from './load-owned-task.js';
import type { LoadTask, PersistTaskEvent } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandleUnpinTaskDeps = {
  load: LoadTask;
  persist: PersistTaskEvent;
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
    const actor = command.actor ?? null;
    const decision = decideUnpinTask({ current, command });

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
