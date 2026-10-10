import { handleCreateProject } from './handle-create-project.js';
import { handleUpdateProject } from './handle-update-project.js';
import { handleListProjects } from './handle-list-projects.js';
import { handleGetProject } from './handle-get-project.js';
import type { ListProjects, LoadProject, PageProjects, PersistProjectChange } from './ports.js';
import {
  withCommandLog,
  type CommandLogger,
} from '../../shared/change-log/application/command-log.js';
import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';

export type ProjectHandlerDeps = {
  persist: PersistProjectChange;
  list: ListProjects;
  pageProjects: PageProjects;
  load: LoadProject;
  nextId: () => string;
  now: () => string;
  logger: CommandLogger;
};

const eventKind = (result: { event?: { type: ChangeLogKind } }): ChangeLogKind[] =>
  result.event ? [result.event.type] : [];

export const createProjectHandlers = (deps: ProjectHandlerDeps) => ({
  list: (query: Parameters<typeof handleListProjects>[0]) => handleListProjects(query, deps),
  get: (query: Parameters<typeof handleGetProject>[0]) => handleGetProject(query, deps),
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
});

export type ProjectHandlers = ReturnType<typeof createProjectHandlers>;
