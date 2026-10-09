import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ReorderOpenTasksCommand } from '../domain/list-commands.js';
import type { ReorderOpenTasksError } from '../domain/list-errors.js';
import type { OpenTasksReordered } from '../domain/events.js';
import { decideReorderOpenTasks } from '../domain/decide-reorder.js';
import type {
  LoadNamedList,
  LoadOpenTasksOnList,
  LoadTasksByIds,
  PersistNamedListEvent,
} from './ports.js';

export type HandleReorderOpenTasksDeps = {
  load: LoadNamedList;
  loadOpenTasksOnList: LoadOpenTasksOnList;
  loadTasksByIds: LoadTasksByIds;
  persist: PersistNamedListEvent;
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
    if (command.listId !== null && !list) {
      const decision = decideReorderOpenTasks({
        command,
        list: null,
        openTasks: [],
        extraTasks: [],
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
          });

          if (decision.isErr()) {
            return errAsync(decision.error);
          }

          const event = decision.value;
          const actor = command.actor ?? null;
          const now = deps.now();
          return deps.persist({ event, actor, now }).map(() => {
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
