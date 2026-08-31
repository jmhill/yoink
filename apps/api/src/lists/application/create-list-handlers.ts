import { handleListNamedLists } from './handle-list-named-lists.js';
import type { ListNamedLists } from './ports.js';

export type ListHandlerDeps = {
  list: ListNamedLists;
};

export const createListHandlers = (deps: ListHandlerDeps) => ({
  list: (query: Parameters<typeof handleListNamedLists>[0]) =>
    handleListNamedLists(query, deps),
});

export type ListHandlers = ReturnType<typeof createListHandlers>;
