import type { ProjectStarter } from '../../../modules/task-management/index.js';
import type { ProcessCaptureToProjectCommand } from './commands.js';

export type CaptureForProject = {
  readonly id: string;
};

/**
 * Pure document. Task Management parses the name and decides the project.
 * `captureId` is the source, stored on the project-created fact.
 */
export const toProjectStarter = (
  command: ProcessCaptureToProjectCommand,
  capture: CaptureForProject
): ProjectStarter => ({
  name: command.name,
  organizationId: command.organizationId,
  createdById: command.createdById,
  status: command.status,
  captureId: capture.id,
  ...(command.objective !== undefined ? { objective: command.objective } : {}),
});
