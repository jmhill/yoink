import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { CreateTaskCommand } from '../domain/task-commands.js';
import type { CreateTaskError } from '../domain/task-errors.js';
import type { TaskCreated } from '../domain/events.js';
import { storageError } from '../domain/task-errors.js';
import { decideCreateTask } from '../domain/decide-create.js';
import { planTaskChange } from '../domain/plan-task-change.js';
import type { LoadNamedList, LoadNextOpenOrder, PersistTaskChange } from './ports.js';
import type { WriteResult } from './write-result.js';
import type { OrgPrincipalLookup } from '../domain/org-principal-lookup.js';
export type HandleCreateTaskDeps = {
  loadList: LoadNamedList;
  loadNextOpenOrder: LoadNextOpenOrder;
  persist: PersistTaskChange;
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
        const now = deps.now();
        const decision = decideCreateTask({
          command,
          list,
          assigneeInOrganization,
          nextOpenOrder,
          id: deps.nextId(),
          now,
        });

        if (decision.isErr()) {
          return errAsync(decision.error);
        }

        const event = decision.value;
        const plan = planTaskChange({
          event,
          current: null,
          actor: command.actor,
          ids: [deps.nextId(), deps.nextId()],
        });
        if (plan.action !== 'insert') {
          return errAsync(storageError('Create did not project a task'));
        }
        return deps.persist(plan).map(() => ({
          event,
          view: plan.view,
        }));
      });
    });
  });
};
