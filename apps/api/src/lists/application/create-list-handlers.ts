import { handleListNamedLists } from './handle-list-named-lists.js';
import { handleCreateNamedList } from './handle-create-named-list.js';
import { handleDeleteNamedList } from './handle-delete-named-list.js';
import type {
  CountOpenTasksOnList,
  ListNamedLists,
  LoadNamedList,
  PersistNamedListEvent,
} from './ports.js';

export type ListHandlerDeps = {
  persist: PersistNamedListEvent;
  list: ListNamedLists;
  load: LoadNamedList;
  countOpenOnList: CountOpenTasksOnList;
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
});

export type ListHandlers = ReturnType<typeof createListHandlers>;
