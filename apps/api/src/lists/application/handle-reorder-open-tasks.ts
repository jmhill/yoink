import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ReorderOpenTasksCommand } from '../domain/list-commands.js';
import type { ReorderOpenTasksError } from '../domain/list-errors.js';
import type { OpenTasksReordered } from '../domain/events.js';
import { storageError } from '../domain/list-errors.js';
import { decideReorderOpenTasks } from '../domain/decide-reorder.js';
import { planListChange } from '../domain/plan-list-change.js';
import type {
  LoadNamedList,
  LoadOpenTasksOnList,
  LoadTasksByIds,
  PersistNamedListChange,
} from './ports.js';

export type HandleReorderOpenTasksDeps = {
  load: LoadNamedList;
  loadOpenTasksOnList: LoadOpenTasksOnList;
  loadTasksByIds: LoadTasksByIds;
  persist: PersistNamedListChange;
  nextId: () => string;
  now: () => string;
};

export type ReorderOpenTasksResult = {
  event: OpenTasksReordered;
  tasks: Task[];
};

export const handleReorderOpenTasks = (
  command: ReorderOpenTasksCommand,
  deps: HandleReorderOpenTasksDeps
): ResultAsync<ReorderOpenTasksResult, ReorderOpenTasksError> => {
  const loadedList =
    command.listId === null
      ? okAsync(null)
      : deps.load(command.listId).map((loaded) =>
          loaded && loaded.organizationId === command.organizationId ? loaded : null
        );

  return loadedList.andThen((list) => {
    const now = deps.now();
    if (command.listId !== null && !list) {
      const decision = decideReorderOpenTasks({
        command,
        list: null,
        openTasks: [],
        extraTasks: [],
        now,
      });
      return errAsync(decision._unsafeUnwrapErr());
    }

    return deps
      .loadOpenTasksOnList(command.organizationId, command.listId)
      .andThen((openTasks) => {
        const openIds = new Set(openTasks.map((task) => task.id));
        const extraIds = command.taskIds.filter((id) => !openIds.has(id));
        const loadedExtras =
          extraIds.length > 0 ? deps.loadTasksByIds(extraIds) : okAsync([] as Task[]);

        return loadedExtras.andThen((extraTasks) => {
          const decision = decideReorderOpenTasks({
            command,
            list,
            openTasks,
            extraTasks,
            now,
          });

          if (decision.isErr()) {
            return errAsync(decision.error);
          }

          const event = decision.value;
          const plan = planListChange({
            event,
            current: list,
            actor: command.actor,
            ids: [deps.nextId()],
          });
          if (!plan || plan.action !== 'reorder') {
            return errAsync(storageError('Reorder did not project a plan'));
          }

          return deps.persist(plan).map(() => {
            const byId = new Map(openTasks.map((task) => [task.id, task]));
            const tasks = event.orders.flatMap((order) => {
              const task = byId.get(order.id);
              return task ? [{ ...task, openOrder: order.openOrder }] : [];
            });
            return { event, tasks };
          });
        });
      });
  });
};
