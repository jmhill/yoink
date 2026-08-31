import { handleListNamedLists } from './handle-list-named-lists.js';
import { handleCreateNamedList } from './handle-create-named-list.js';
import type { ListNamedLists, PersistNamedListEvent } from './ports.js';

export type ListHandlerDeps = {
  persist: PersistNamedListEvent;
  list: ListNamedLists;
  nextId: () => string;
  now: () => string;
};

export const createListHandlers = (deps: ListHandlerDeps) => ({
  list: (query: Parameters<typeof handleListNamedLists>[0]) =>
    handleListNamedLists(query, deps),
  create: (command: Parameters<typeof handleCreateNamedList>[0]) =>
    handleCreateNamedList(command, deps),
});

export type ListHandlers = ReturnType<typeof createListHandlers>;
