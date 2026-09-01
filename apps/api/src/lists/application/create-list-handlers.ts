import { handleListNamedLists } from './handle-list-named-lists.js';
import { handleCreateNamedList } from './handle-create-named-list.js';
import { handleDeleteNamedList } from './handle-delete-named-list.js';
import { handleListOpenTasksOnList } from './handle-list-open-tasks.js';
import { handleReorderOpenTasks } from './handle-reorder-open-tasks.js';
import type {
  CountOpenTasksOnList,
  ListNamedLists,
  LoadNamedList,
  LoadOpenTasksOnList,
  LoadTasksByIds,
  PersistNamedListEvent,
  PersistOpenTaskOrders,
} from './ports.js';

export type ListHandlerDeps = {
  persist: PersistNamedListEvent;
  list: ListNamedLists;
  load: LoadNamedList;
  countOpenOnList: CountOpenTasksOnList;
  loadOpenTasksOnList: LoadOpenTasksOnList;
  loadTasksByIds: LoadTasksByIds;
  persistOpenTaskOrders: PersistOpenTaskOrders;
  nextId: () => string;
  now: () => string;
};

export const createListHandlers = (deps: ListHandlerDeps) => ({
  list: (query: Parameters<typeof handleListNamedLists>[0]) =>
    handleListNamedLists(query, deps),
  create: (command: Parameters<typeof handleCreateNamedList>[0]) =>
    handleCreateNamedList(command, deps),
  delete: (command: Parameters<typeof handleDeleteNamedList>[0]) =>
    handleDeleteNamedList(command, deps),
  listOpenTasks: (query: Parameters<typeof handleListOpenTasksOnList>[0]) =>
    handleListOpenTasksOnList(query, deps),
  reorderOpenTasks: (command: Parameters<typeof handleReorderOpenTasks>[0]) =>
    handleReorderOpenTasks(command, deps),
});

export type ListHandlers = ReturnType<typeof createListHandlers>;
