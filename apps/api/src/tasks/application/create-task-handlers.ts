import { handleUpdateTask } from './handle-update-task.js';
import type { HandleUpdateTaskDeps } from './handle-update-task.js';

export type TaskHandlerDeps = HandleUpdateTaskDeps;

export const createTaskHandlers = (deps: TaskHandlerDeps) => ({
  update: (command: Parameters<typeof handleUpdateTask>[0]) =>
    handleUpdateTask(command, deps),
});

export type TaskHandlers = ReturnType<typeof createTaskHandlers>;
