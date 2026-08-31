import { handleCreateTask } from './handle-create-task.js';
import type { HandleCreateTaskDeps } from './handle-create-task.js';
import { handleUpdateTask } from './handle-update-task.js';
import type { HandleUpdateTaskDeps } from './handle-update-task.js';

export type TaskHandlerDeps = HandleCreateTaskDeps & HandleUpdateTaskDeps;

export const createTaskHandlers = (deps: TaskHandlerDeps) => ({
  create: (command: Parameters<typeof handleCreateTask>[0]) =>
    handleCreateTask(command, deps),
  update: (command: Parameters<typeof handleUpdateTask>[0]) =>
    handleUpdateTask(command, deps),
});

export type TaskHandlers = ReturnType<typeof createTaskHandlers>;
