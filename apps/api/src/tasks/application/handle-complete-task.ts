import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { CompleteTaskCommand } from '../domain/task-commands.js';
import type { CompleteTaskError } from '../domain/task-errors.js';
import type { TaskCompleted } from '../domain/events.js';
import { decideCompleteTask } from '../domain/decide-complete.js';
import { applyTaskEvent } from '../domain/apply-task-event.js';
import { loadOwnedTask } from './load-owned-task.js';
import type { LoadTask, PersistTaskEvent } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandleCompleteTaskDeps = {
  load: LoadTask;
  persist: PersistTaskEvent;
  now: () => string;
};

export const handleCompleteTask = (
  command: CompleteTaskCommand,
  deps: HandleCompleteTaskDeps
): ResultAsync<WriteResult<TaskCompleted>, CompleteTaskError> => {
  return loadOwnedTask({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const now = deps.now();
    const actor = command.actor ?? null;
    const decision = decideCompleteTask({
      current,
      command,
      now,
    });

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
