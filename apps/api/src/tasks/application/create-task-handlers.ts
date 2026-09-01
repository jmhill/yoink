import { handleCreateTask } from './handle-create-task.js';
import type { HandleCreateTaskDeps } from './handle-create-task.js';
import { handleUpdateTask } from './handle-update-task.js';
import type { HandleUpdateTaskDeps } from './handle-update-task.js';
import { handleCompleteTask } from './handle-complete-task.js';
import type { HandleCompleteTaskDeps } from './handle-complete-task.js';
import { handleUncompleteTask } from './handle-uncomplete-task.js';
import type { HandleUncompleteTaskDeps } from './handle-uncomplete-task.js';

export type TaskHandlerDeps = HandleCreateTaskDeps &
  HandleUpdateTaskDeps &
  HandleCompleteTaskDeps &
  HandleUncompleteTaskDeps;

export const createTaskHandlers = (deps: TaskHandlerDeps) => ({
  create: (command: Parameters<typeof handleCreateTask>[0]) =>
    handleCreateTask(command, deps),
  update: (command: Parameters<typeof handleUpdateTask>[0]) =>
    handleUpdateTask(command, deps),
  complete: (command: Parameters<typeof handleCompleteTask>[0]) =>
    handleCompleteTask(command, deps),
  uncomplete: (command: Parameters<typeof handleUncompleteTask>[0]) =>
    handleUncompleteTask(command, deps),
});

export type TaskHandlers = ReturnType<typeof createTaskHandlers>;
