import { withCommandLog, type CommandLogger } from '../../../kernel/command-log.js';
import type { UnitOfWork } from '../../../kernel/unit-of-work.js';
import type { Captures } from '../../../modules/captures/index.js';
import type { TaskManagement } from '../../../modules/task-management/index.js';
import type {
  ProcessCaptureToProjectCommand,
  ProcessCaptureToTaskCommand,
} from '../domain/commands.js';
import { handleProcessCaptureToProject } from './handle-process-to-project.js';
import { handleProcessCaptureToTask } from './handle-process-to-task.js';

export type ProcessingHandlerDeps = {
  captures: Captures;
  taskManagement: TaskManagement;
  uow: UnitOfWork;
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
      () => handleProcessCaptureToTask(command, deps)
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
      () => handleProcessCaptureToProject(command, deps)
    ),
});

export type CaptureProcessingService = ReturnType<typeof createProcessingHandlers>;
