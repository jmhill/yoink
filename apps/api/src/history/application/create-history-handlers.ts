import { handleListProjectHistory } from './handle-list-project-history.js';
import { handleListTaskHistory } from './handle-list-task-history.js';
import { handleListFinishedTasksOnProject } from './handle-list-finished-tasks.js';
import type {
  HistoryReadLogger,
  LoadProject,
  LoadTaskIncludingDeleted,
  LoadTimelineLookups,
  PageFinishedTasksInProject,
  PageProjectHistory,
  PageTaskHistory,
} from './ports.js';

export type HistoryHandlerDeps = {
  loadProject: LoadProject;
  loadTaskIncludingDeleted: LoadTaskIncludingDeleted;
  pageProjectHistory: PageProjectHistory;
  pageTaskHistory: PageTaskHistory;
  pageFinishedTasksInProject: PageFinishedTasksInProject;
  loadLookups: LoadTimelineLookups;
  logger: HistoryReadLogger;
};

export const createHistoryHandlers = (deps: HistoryHandlerDeps) => ({
  listProjectHistory: (query: Parameters<typeof handleListProjectHistory>[0]) =>
    handleListProjectHistory(query, {
      load: deps.loadProject,
      pageProjectHistory: deps.pageProjectHistory,
      loadLookups: deps.loadLookups,
      logger: deps.logger,
    }),
  listTaskHistory: (query: Parameters<typeof handleListTaskHistory>[0]) =>
    handleListTaskHistory(query, {
      loadTaskIncludingDeleted: deps.loadTaskIncludingDeleted,
      pageTaskHistory: deps.pageTaskHistory,
      loadLookups: deps.loadLookups,
      logger: deps.logger,
    }),
  listFinishedTasks: (query: Parameters<typeof handleListFinishedTasksOnProject>[0]) =>
    handleListFinishedTasksOnProject(query, {
      load: deps.loadProject,
      pageFinishedTasksInProject: deps.pageFinishedTasksInProject,
      loadLookups: deps.loadLookups,
    }),
});

export type HistoryHandlers = ReturnType<typeof createHistoryHandlers>;
