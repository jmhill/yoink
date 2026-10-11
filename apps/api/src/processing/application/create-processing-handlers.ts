import type { ProcessCaptureToProjectCommand } from '../../captures/domain/capture-commands.js';
import type { ProcessCaptureToTaskCommand } from '../../captures/domain/capture-commands.js';
import {
  withCommandLog,
  type CommandLogger,
} from '../../shared/change-log/application/command-log.js';
import {
  handleProcessCaptureToProject,
  type HandleProcessCaptureToProjectDeps,
} from './handle-process-to-project.js';
import {
  handleProcessCaptureToTask,
  type HandleProcessCaptureToTaskDeps,
} from './handle-process-to-task.js';

export type ProcessingHandlerDeps = {
  processToTask: HandleProcessCaptureToTaskDeps;
  processToProject: HandleProcessCaptureToProjectDeps;
  logger: CommandLogger;
};

export const createProcessingHandlers = (deps: ProcessingHandlerDeps) => ({
  processCaptureToTask: (command: ProcessCaptureToTaskCommand) =>
    withCommandLog(
      deps.logger,
      {
        command: 'ProcessCaptureToTask',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      () => ['TaskCreated' as const],
      () => handleProcessCaptureToTask(command, deps.processToTask)
    ),
  processCaptureToProject: (command: ProcessCaptureToProjectCommand) =>
    withCommandLog(
      deps.logger,
      {
        command: 'ProcessCaptureToProject',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      () => ['ProjectCreated' as const],
      () => handleProcessCaptureToProject(command, deps.processToProject)
    ),
});

export type CaptureProcessingService = ReturnType<typeof createProcessingHandlers>;
