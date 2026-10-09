import { handleCreateTask } from './handle-create-task.js';
import type { HandleCreateTaskDeps } from './handle-create-task.js';
import { handleUpdateTask } from './handle-update-task.js';
import type { HandleUpdateTaskDeps } from './handle-update-task.js';
import { handleCompleteTask } from './handle-complete-task.js';
import type { HandleCompleteTaskDeps } from './handle-complete-task.js';
import { handleUncompleteTask } from './handle-uncomplete-task.js';
import type { HandleUncompleteTaskDeps } from './handle-uncomplete-task.js';
import { handleListTasks } from './handle-list-tasks.js';
import type { HandleListTasksDeps } from './handle-list-tasks.js';
import { handlePinTask } from './handle-pin-task.js';
import type { HandlePinTaskDeps } from './handle-pin-task.js';
import { handleUnpinTask } from './handle-unpin-task.js';
import type { HandleUnpinTaskDeps } from './handle-unpin-task.js';
import { handleDeleteTask } from './handle-delete-task.js';
import type { HandleDeleteTaskDeps } from './handle-delete-task.js';
import {
  withCommandLog,
  type CommandLogger,
} from '../../shared/change-log/application/command-log.js';
import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';

export type TaskHandlerDeps = HandleCreateTaskDeps &
  HandleUpdateTaskDeps &
  HandleCompleteTaskDeps &
  HandleUncompleteTaskDeps &
  HandleListTasksDeps &
  HandlePinTaskDeps &
  HandleUnpinTaskDeps &
  HandleDeleteTaskDeps & {
    logger: CommandLogger;
  };

const eventKindsOf = (result: { eventKinds: ChangeLogKind[] }) => result.eventKinds;

export const createTaskHandlers = (deps: TaskHandlerDeps) => ({
  create: (command: Parameters<typeof handleCreateTask>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'CreateTask',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      eventKindsOf,
      () => handleCreateTask(command, deps)
    ),
  update: (command: Parameters<typeof handleUpdateTask>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'UpdateTask',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      eventKindsOf,
      () => handleUpdateTask(command, deps)
    ),
  complete: (command: Parameters<typeof handleCompleteTask>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'CompleteTask',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      eventKindsOf,
      () => handleCompleteTask(command, deps)
    ),
  uncomplete: (command: Parameters<typeof handleUncompleteTask>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'UncompleteTask',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      eventKindsOf,
      () => handleUncompleteTask(command, deps)
    ),
  list: (query: Parameters<typeof handleListTasks>[0]) =>
    handleListTasks(query, deps),
  pin: (command: Parameters<typeof handlePinTask>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'PinTask',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      eventKindsOf,
      () => handlePinTask(command, deps)
    ),
  unpin: (command: Parameters<typeof handleUnpinTask>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'UnpinTask',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      eventKindsOf,
      () => handleUnpinTask(command, deps)
    ),
  delete: (command: Parameters<typeof handleDeleteTask>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'DeleteTask',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      eventKindsOf,
      () => handleDeleteTask(command, deps)
    ),
});

export type TaskHandlers = ReturnType<typeof createTaskHandlers>;
