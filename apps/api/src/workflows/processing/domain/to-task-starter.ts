import type { TaskStarter } from '../../../modules/task-management/index.js';
import type { ProcessCaptureToTaskCommand } from './commands.js';

/** Default title length. The capture content is cut here; a supplied title is not. */
const MAX_TASK_TITLE_LENGTH = 100;

export type CaptureForTask = {
  readonly id: string;
  readonly content: string;
};

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
};

/**
 * Pure Clarify rule. Task Management decides the task from this document.
 * The inbox check stays on the capture query and the claim guard.
 */
export const toTaskStarter = (
  command: ProcessCaptureToTaskCommand,
  capture: CaptureForTask
): TaskStarter => ({
  title: command.title ?? truncate(capture.content, MAX_TASK_TITLE_LENGTH),
  organizationId: command.organizationId,
  createdById: command.createdById,
  captureId: capture.id,
  ...(command.dueDate !== undefined ? { dueDate: command.dueDate } : {}),
  ...(command.listId !== undefined ? { listId: command.listId } : {}),
  ...(command.projectId !== undefined ? { projectId: command.projectId } : {}),
});
