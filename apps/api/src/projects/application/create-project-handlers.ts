import { handleCreateProject } from './handle-create-project.js';
import { handleUpdateProject } from './handle-update-project.js';
import { handleListProjects } from './handle-list-projects.js';
import { handleGetProject } from './handle-get-project.js';
import { handleListOpenTasksOnProject } from './handle-list-open-tasks.js';
import { handleChangeProjectStatus } from './handle-change-project-status.js';
import { handleSetNextAction } from './handle-set-next-action.js';
import { handleStageImport } from './handle-stage-import.js';
import { handleListImports } from './handle-list-imports.js';
import { handleGetImport } from './handle-get-import.js';
import { handleApplyImport } from './handle-apply-import.js';
import { handleDiscardImport } from './handle-discard-import.js';
import type {
  ListPendingImports,
  ListProjects,
  LoadListsByIds,
  LoadMemberIds,
  LoadNamedList,
  LoadNextOpenOrder,
  LoadProject,
  LoadStagedImport,
  LoadTask,
  LoadTasksByIds,
  LoadUserName,
  PageOpenTasksOnProject,
  PageProjects,
  PersistImportApply,
  PersistImportDiscard,
  PersistProjectChange,
  PersistProjectStatusChange,
  PersistSetNextAction,
  PersistStagedImport,
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
  persistSetNextAction: PersistSetNextAction;
  persistStage: PersistStagedImport;
  persistApply: PersistImportApply;
  persistDiscard: PersistImportDiscard;
  loadImport: LoadStagedImport;
  listPendingImports: ListPendingImports;
  loadTasksByIds: LoadTasksByIds;
  loadListsByIds: LoadListsByIds;
  loadMemberIds: LoadMemberIds;
  loadUserName: LoadUserName;
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
  stageImport: (command: Parameters<typeof handleStageImport>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'StageProjectImport',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      () => ['ProjectImported'],
      () => handleStageImport(command, { ...deps, persistStage: deps.persistStage })
    ),
  listImports: (query: Parameters<typeof handleListImports>[0]) =>
    handleListImports(query, {
      ...deps,
      listPending: deps.listPendingImports,
    }),
  getImport: (query: Parameters<typeof handleGetImport>[0]) =>
    handleGetImport(query, deps),
  applyImport: (command: Parameters<typeof handleApplyImport>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'ApplyProjectImport',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      () => ['ProjectImported'],
      () => handleApplyImport(command, deps)
    ),
  discardImport: (command: Parameters<typeof handleDiscardImport>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'DiscardProjectImport',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      () => [],
      () => handleDiscardImport(command, deps)
    ),
});

export type ProjectHandlers = ReturnType<typeof createProjectHandlers>;
