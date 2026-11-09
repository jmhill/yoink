import { handleListNamedLists } from './handlers/handle-list-named-lists.js';
import { handleCreateNamedList } from './handlers/handle-create-named-list.js';
import { handleRenameNamedList } from './handlers/handle-rename-named-list.js';
import { handleDeleteNamedList } from './handlers/handle-delete-named-list.js';
import { handleListOpenTasksOnList } from './handlers/handle-list-open-tasks-on-list.js';
import { handleListUnlistedOpenTasks } from './handlers/handle-list-unlisted-open-tasks.js';
import { handleReorderOpenTasks } from './handlers/handle-reorder-open-tasks.js';
import type {
  CountOpenTasksOnList,
  ListNamedLists,
  LoadNamedList,
  LoadOpenTasksOnList,
  LoadTasksByIds,
  PageNamedLists,
  PageOpenTasksOnList,
  PersistNamedListChange,
} from './ports.js';
import {
  withCommandLog,
  type CommandLogger,
} from '../../../kernel/command-log.js';
import type { ChangeLogKind } from '../../history/domain/kinds.js';

export type ListHandlerDeps = {
  persist: PersistNamedListChange;
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

const eventKind = (result: { event: { type: ChangeLogKind } }): ChangeLogKind[] => [
  result.event.type,
];

export const createListHandlers = (deps: ListHandlerDeps) => ({
  list: (query: Parameters<typeof handleListNamedLists>[0]) =>
    handleListNamedLists(query, deps),
  create: (command: Parameters<typeof handleCreateNamedList>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'CreateNamedList',
        organizationId: command.organizationId,
        actor: command.actor,
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
        actor: command.actor,
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
        actor: command.actor,
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
        actor: command.actor,
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
        actor: command.actor,
      },
      eventKind,
      () => handleReorderOpenTasks({ ...command, listId: null }, deps)
    ),
});

export type ListHandlers = ReturnType<typeof createListHandlers>;
