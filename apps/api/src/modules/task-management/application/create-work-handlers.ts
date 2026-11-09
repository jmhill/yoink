import { handleListNowDue } from './handlers/handle-list-now-due.js';
import type { HandleListNowDueDeps } from './handlers/handle-list-now-due.js';
import { handleListNowNextActions } from './handlers/handle-list-now-next-actions.js';
import type { HandleListNowNextActionsDeps } from './handlers/handle-list-now-next-actions.js';
import { handleListWorkLists } from './handlers/handle-list-work-lists.js';
import type { HandleListWorkListsDeps } from './handlers/handle-list-work-lists.js';

export type WorkHandlerDeps = HandleListNowNextActionsDeps &
  HandleListNowDueDeps &
  HandleListWorkListsDeps;

export const createWorkHandlers = (deps: WorkHandlerDeps) => ({
  listNextActions: (query: Parameters<typeof handleListNowNextActions>[0]) =>
    handleListNowNextActions(query, deps),
  listDue: (query: Parameters<typeof handleListNowDue>[0]) => handleListNowDue(query, deps),
  listLists: (query: Parameters<typeof handleListWorkLists>[0]) =>
    handleListWorkLists(query, deps),
});

export type WorkHandlers = ReturnType<typeof createWorkHandlers>;
