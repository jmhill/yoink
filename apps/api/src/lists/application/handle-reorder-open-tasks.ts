import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ReorderOpenTasksCommand } from '../domain/list-commands.js';
import type { ReorderOpenTasksError } from '../domain/list-errors.js';
import { decideReorderOpenTasks } from '../domain/decide-reorder.js';
import type {
  LoadNamedList,
  LoadOpenTasksOnList,
  LoadTasksByIds,
  PersistOpenTaskOrders,
} from './ports.js';

export type HandleReorderOpenTasksDeps = {
  load: LoadNamedList;
  loadOpenTasksOnList: LoadOpenTasksOnList;
  loadTasksByIds: LoadTasksByIds;
  persistOpenTaskOrders: PersistOpenTaskOrders;
};

export type ReorderOpenTasksResult = {
  tasks: Task[];
};

export const handleReorderOpenTasks = (
  command: ReorderOpenTasksCommand,
  deps: HandleReorderOpenTasksDeps
): ResultAsync<ReorderOpenTasksResult, ReorderOpenTasksError> => {
  return deps.load(command.listId).andThen((loaded) => {
    const list =
      loaded && loaded.organizationId === command.organizationId ? loaded : null;

    if (!list) {
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
          return deps.persistOpenTaskOrders(event.orders).map(() => {
            const byId = new Map(openTasks.map((task) => [task.id, task]));
            const tasks = event.orders.flatMap((order) => {
              const task = byId.get(order.id);
              return task ? [{ ...task, openOrder: order.openOrder }] : [];
            });
            return { tasks };
          });
        });
      });
  });
};
