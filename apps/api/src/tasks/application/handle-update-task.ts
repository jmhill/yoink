import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { UpdateTaskCommand } from '../domain/task-commands.js';
import type { UpdateTaskError } from '../domain/task-errors.js';
import type { TaskUpdated } from '../domain/events.js';
import { decideUpdateTask } from '../domain/decide-update.js';
import { applyTaskEvent } from '../domain/apply-task-event.js';
import { loadOwnedTask } from './load-owned-task.js';
import type { LoadNamedList, LoadNextOpenOrder, LoadTask, PersistTaskEvent } from './ports.js';
import type { WriteResult } from './write-result.js';
import type { OrgPrincipalLookup } from '../domain/org-principal-lookup.js';

export type HandleUpdateTaskDeps = {
  load: LoadTask;
  loadList: LoadNamedList;
  loadNextOpenOrder: LoadNextOpenOrder;
  persist: PersistTaskEvent;
  principalLookup?: OrgPrincipalLookup;
};

export const handleUpdateTask = (
  command: UpdateTaskCommand,
  deps: HandleUpdateTaskDeps
): ResultAsync<WriteResult<TaskUpdated>, UpdateTaskError> => {
  return loadOwnedTask({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const listIdToLoad =
      command.listId !== undefined &&
      command.listId !== null &&
      command.listId !== current.listId
        ? command.listId
        : null;
    const loadedList = listIdToLoad
      ? deps.loadList(listIdToLoad)
      : okAsync(null);

    const destListId =
      command.listId !== undefined && command.listId !== current.listId
        ? command.listId
        : undefined;
    const loadedNextOpenOrder =
      destListId !== undefined
        ? deps.loadNextOpenOrder(command.organizationId, destListId)
        : okAsync(0);

    return loadedList.andThen((list) =>
      loadedNextOpenOrder.andThen((nextOpenOrder) => {
      const assigneeCheck =
        command.assigneeId !== undefined && command.assigneeId !== null
          ? deps.principalLookup
            ? deps.principalLookup.existsInOrganization(
                command.assigneeId,
                command.organizationId
              )
            : okAsync(false)
          : okAsync(null as boolean | null);

      return assigneeCheck.andThen((assigneeInOrganization) => {
        const decision = decideUpdateTask({
          current,
          command,
          list,
          assigneeInOrganization,
          nextOpenOrder,
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
    })
    );
  });
};
