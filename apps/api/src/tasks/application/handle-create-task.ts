import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { CreateTaskCommand } from '../domain/task-commands.js';
import type { CreateTaskError } from '../domain/task-errors.js';
import type { TaskCreated } from '../domain/events.js';
import { storageError } from '../domain/task-errors.js';
import { decideCreateTask } from '../domain/decide-create.js';
import { planTaskChange } from '../domain/plan-task-change.js';
import type { LoadNamedList, LoadNextOpenOrder, LoadProject, PersistTaskChange } from './ports.js';
import { kindsFromRecords, type WriteResult } from './write-result.js';
import type { OrgPrincipalLookup } from '../domain/org-principal-lookup.js';

export type HandleCreateTaskDeps = {
  loadList: LoadNamedList;
  loadProject: LoadProject;
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
  const loadedProject = command.projectId
    ? deps.loadProject(command.projectId)
    : okAsync(null);

  return loadedList.andThen((list) =>
    loadedProject.andThen((project) => {
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
            project,
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
            ids: { recordId: deps.nextId() },
          });
          return deps
            .persist(plan)
            .mapErr((error): CreateTaskError =>
              error.type === 'TASK_NOT_FOUND'
                ? storageError('Failed to persist task change')
                : error
            )
            .map(() => ({
              event,
              view: plan.view,
              eventKinds: kindsFromRecords(plan.records),
            }));
        });
      });
    })
  );
};
