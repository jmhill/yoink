import { handleListNamedLists } from './handle-list-named-lists.js';
import { handleCreateNamedList } from './handle-create-named-list.js';
import { handleRenameNamedList } from './handle-rename-named-list.js';
import { handleDeleteNamedList } from './handle-delete-named-list.js';
import { handleListOpenTasksOnList } from './handle-list-open-tasks.js';
import { handleListUnlistedOpenTasks } from './handle-list-unlisted-open-tasks.js';
import { handleReorderOpenTasks } from './handle-reorder-open-tasks.js';
import type {
  CountOpenTasksOnList,
  ListNamedLists,
  LoadNamedList,
  LoadOpenTasksOnList,
  LoadTasksByIds,
  PageNamedLists,
  PageOpenTasksOnList,
  PersistNamedListEvent,
} from './ports.js';
import {
  withCommandLog,
  type CommandLogger,
} from '../../shared/change-log/application/command-log.js';

export type ListHandlerDeps = {
  persist: PersistNamedListEvent;
  list: ListNamedLists;
  pageNamedLists: PageNamedLists;
  load: LoadNamedList;
  countOpenOnList: CountOpenTasksOnList;
  loadOpenTasksOnList: LoadOpenTasksOnList;
  pageOpenTasksOnList: PageOpenTasksOnList;
  loadTasksByIds: LoadTasksByIds;
  nextId: () => string;
  now: () => string;
  logger: CommandLogger;
};

const eventKind = (result: { event: { type: string } }) => [result.event.type];

export const createListHandlers = (deps: ListHandlerDeps) => ({
  list: (query: Parameters<typeof handleListNamedLists>[0]) =>
    handleListNamedLists(query, deps),
  create: (command: Parameters<typeof handleCreateNamedList>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'CreateNamedList',
        organizationId: command.organizationId,
        actor: command.actor ?? null,
      },
      eventKind,
      () => handleCreateNamedList(command, deps)
    ),
  rename: (command: Parameters<typeof handleRenameNamedList>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'RenameNamedList',
        organizationId: command.organizationId,
        actor: command.actor ?? null,
      },
      eventKind,
      () => handleRenameNamedList(command, deps)
    ),
  delete: (command: Parameters<typeof handleDeleteNamedList>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'DeleteNamedList',
        organizationId: command.organizationId,
        actor: command.actor ?? null,
      },
      eventKind,
      () => handleDeleteNamedList(command, deps)
    ),
  listOpenTasks: (query: Parameters<typeof handleListOpenTasksOnList>[0]) =>
    handleListOpenTasksOnList(query, deps),
  listUnlistedOpenTasks: (query: Parameters<typeof handleListUnlistedOpenTasks>[0]) =>
    handleListUnlistedOpenTasks(query, deps),
  reorderOpenTasks: (command: Parameters<typeof handleReorderOpenTasks>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'ReorderOpenTasks',
        organizationId: command.organizationId,
        actor: command.actor ?? null,
      },
      eventKind,
      () => handleReorderOpenTasks(command, deps)
    ),
  reorderUnlistedOpenTasks: (
    command: Omit<Parameters<typeof handleReorderOpenTasks>[0], 'listId'>
  ) =>
    withCommandLog(
      deps.logger,
      {
        command: 'ReorderUnlistedOpenTasks',
        organizationId: command.organizationId,
        actor: command.actor ?? null,
      },
      eventKind,
      () => handleReorderOpenTasks({ ...command, listId: null }, deps)
    ),
});

export type ListHandlers = ReturnType<typeof createListHandlers>;
