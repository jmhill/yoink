import { handleConfirmProposal } from './handlers/handle-confirm-proposal.js';
import { handleCreateProject } from './handlers/handle-create-project.js';
import { handleDeclineProposal } from './handlers/handle-decline-proposal.js';
import { handleRestoreProposal } from './handlers/handle-restore-proposal.js';
import { handleUpdateProject } from './handlers/handle-update-project.js';
import { handleListProjects } from './handlers/handle-list-projects.js';
import { handleGetProject } from './handlers/handle-get-project.js';
import { handleListOpenTasksOnProject } from './handlers/handle-list-open-tasks-on-project.js';
import { handleChangeProjectStatus } from './handlers/handle-change-project-status.js';
import { handleSetNextAction } from './handlers/handle-set-next-action.js';
import { handleStageImport } from './handlers/handle-stage-import.js';
import { handleListImports } from './handlers/handle-list-imports.js';
import { handleGetImport } from './handlers/handle-get-import.js';
import { handleApplyImport } from './handlers/handle-apply-import.js';
import { handleDiscardImport } from './handlers/handle-discard-import.js';
import type {
  ListPendingImports,
  ListProjects,
  LoadListsByIds,
  LoadMemberIds,
  LoadListRef,
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
import type { OrgPrincipalLookup } from '../domain/model/org-principal-lookup.js';
import {
  withCommandLog,
  type CommandLogger,
} from '../../../kernel/command-log.js';
import type { ChangeLogKind } from '../../history/domain/kinds.js';

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
  loadList: LoadListRef;
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
      () => [],
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
  confirmProposal: (command: Parameters<typeof handleConfirmProposal>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'ConfirmProposedProject',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      (result) => result.eventKinds,
      () => handleConfirmProposal(command, deps)
    ),
  declineProposal: (command: Parameters<typeof handleDeclineProposal>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'DeclineProposedProject',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      (result) => result.eventKinds,
      () => handleDeclineProposal(command, deps)
    ),
  restoreProposal: (command: Parameters<typeof handleRestoreProposal>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'RestoreDeclinedProject',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      (result) => result.eventKinds,
      () => handleRestoreProposal(command, deps)
    ),
});

export type ProjectHandlers = ReturnType<typeof createProjectHandlers>;
