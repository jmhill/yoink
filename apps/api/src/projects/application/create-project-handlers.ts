import { handleCreateProject } from './handle-create-project.js';
import { handleUpdateProject } from './handle-update-project.js';
import { handleListProjects } from './handle-list-projects.js';
import { handleGetProject } from './handle-get-project.js';
import { handleListOpenTasksOnProject } from './handle-list-open-tasks.js';
import { handleChangeProjectStatus } from './handle-change-project-status.js';
import { handleSetNextAction } from './handle-set-next-action.js';
import type {
  ListProjects,
  LoadNamedList,
  LoadNextOpenOrder,
  LoadProject,
  LoadTask,
  PageOpenTasksOnProject,
  PageProjects,
  PersistProjectChange,
  PersistProjectStatusChange,
} from './ports.js';
import type { OrgPrincipalLookup } from '../../tasks/domain/org-principal-lookup.js';
import {
  withCommandLog,
  type CommandLogger,
} from '../../shared/change-log/application/command-log.js';
import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';

export type ProjectHandlerDeps = {
  persist: PersistProjectChange;
  persistStatus: PersistProjectStatusChange;
  list: ListProjects;
  pageProjects: PageProjects;
  load: LoadProject;
  loadTask: LoadTask;
  loadList: LoadNamedList;
  loadNextOpenOrder: LoadNextOpenOrder;
  pageOpenTasksOnProject: PageOpenTasksOnProject;
  principalLookup?: OrgPrincipalLookup;
  nextId: () => string;
  now: () => string;
  logger: CommandLogger;
};

const eventKind = (result: { event?: { type: ChangeLogKind } }): ChangeLogKind[] =>
  result.event ? [result.event.type] : [];

export const createProjectHandlers = (deps: ProjectHandlerDeps) => ({
  list: (query: Parameters<typeof handleListProjects>[0]) => handleListProjects(query, deps),
  get: (query: Parameters<typeof handleGetProject>[0]) => handleGetProject(query, deps),
  listOpenTasks: (query: Parameters<typeof handleListOpenTasksOnProject>[0]) =>
    handleListOpenTasksOnProject(query, deps),
  create: (command: Parameters<typeof handleCreateProject>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'CreateProject',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      eventKind,
      () => handleCreateProject(command, deps)
    ),
  update: (command: Parameters<typeof handleUpdateProject>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'UpdateProject',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      eventKind,
      () => handleUpdateProject(command, deps)
    ),
  changeStatus: (command: Parameters<typeof handleChangeProjectStatus>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'ChangeProjectStatus',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      (result) => result.eventKinds,
      () => handleChangeProjectStatus(command, deps)
    ),
  setNextAction: (command: Parameters<typeof handleSetNextAction>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'SetProjectNextAction',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      (result) => result.eventKinds,
      () => handleSetNextAction(command, deps)
    ),
});

export type ProjectHandlers = ReturnType<typeof createProjectHandlers>;
