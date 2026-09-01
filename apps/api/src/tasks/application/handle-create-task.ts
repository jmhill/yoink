import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { CreateTaskCommand } from '../domain/task-commands.js';
import type { CreateTaskError } from '../domain/task-errors.js';
import type { TaskCreated } from '../domain/events.js';
import { decideCreateTask } from '../domain/decide-create.js';
import { applyTaskEvent } from '../domain/apply-task-event.js';
import type { LoadNamedList, LoadNextOpenOrder, PersistTaskEvent } from './ports.js';
import type { WriteResult } from './write-result.js';
import type { OrgPrincipalLookup } from '../domain/org-principal-lookup.js';

export type HandleCreateTaskDeps = {
  loadList: LoadNamedList;
  loadNextOpenOrder: LoadNextOpenOrder;
  persist: PersistTaskEvent;
  principalLookup?: OrgPrincipalLookup;
  nextId: () => string;
  now: () => string;
};

export const handleCreateTask = (
  command: CreateTaskCommand,
  deps: HandleCreateTaskDeps
): ResultAsync<WriteResult<TaskCreated>, CreateTaskError> => {
  const loadedList = command.listId
    ? deps.loadList(command.listId)
    : okAsync(null);

  return loadedList.andThen((list) => {
    const destListId = command.listId ?? null;
    return deps.loadNextOpenOrder(command.organizationId, destListId).andThen((nextOpenOrder) => {
    const assigneeCheck =
      command.assigneeId !== undefined
        ? deps.principalLookup
          ? deps.principalLookup.existsInOrganization(
              command.assigneeId,
              command.organizationId
            )
          : okAsync(false)
        : okAsync(null as boolean | null);

    return assigneeCheck.andThen((assigneeInOrganization) => {
      const decision = decideCreateTask({
        command,
        list,
        assigneeInOrganization,
        nextOpenOrder,
        id: deps.nextId(),
        now: deps.now(),
      });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      const event = decision.value;
      return deps.persist({ event, current: null }).map(() => ({
        event,
        view: applyTaskEvent(null, event),
      }));
    });
    });
  });
};
