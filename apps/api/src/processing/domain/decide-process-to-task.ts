import { err, ok, type Result } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { ProcessCaptureToTaskCommand } from '../../captures/domain/capture-commands.js';
import {
  captureNotFoundError,
  captureNotInInboxError,
  type CaptureNotFoundError,
  type CaptureNotInInboxError,
} from '../../captures/domain/capture-errors.js';
import {
  decideCreateTask,
  type DecideCreateTaskError,
} from '../../tasks/domain/decide-create.js';
import type { CreateTaskCommand, LoadedProject } from '../../tasks/domain/task-commands.js';
import type { TaskCreated } from '../../tasks/domain/events.js';

const MAX_TASK_TITLE_LENGTH = 100;

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
};

export type CaptureProcessedToTask = {
  type: 'CaptureProcessed';
  id: string;
  organizationId: string;
  processedAt: string;
  processedToType: 'task';
  processedToId: string;
  occurredAt: string;
};

export type DecideProcessCaptureToTaskInput = {
  command: ProcessCaptureToTaskCommand;
  capture: Capture | null;
  list: { id: string; organizationId: string } | null;
  project: LoadedProject | null;
  assigneeInOrganization: boolean | null;
  nextOpenOrder: number;
  id: string;
  now: string;
};

export type DecideProcessCaptureToTaskError =
  | CaptureNotFoundError
  | CaptureNotInInboxError
  | DecideCreateTaskError;

export type ProcessCaptureToTaskDecision = {
  taskCreated: TaskCreated;
  captureProcessed: CaptureProcessedToTask;
};

export const decideProcessCaptureToTask = ({
  command,
  capture,
  list,
  project,
  assigneeInOrganization,
  nextOpenOrder,
  id,
  now,
}: DecideProcessCaptureToTaskInput): Result<
  ProcessCaptureToTaskDecision,
  DecideProcessCaptureToTaskError
> => {
  if (!capture || capture.organizationId !== command.organizationId) {
    return err(captureNotFoundError(command.id));
  }

  if (capture.status !== 'inbox') {
    return err(captureNotInInboxError(command.id));
  }

  const createCommand: CreateTaskCommand = {
    title: command.title ?? truncate(capture.content, MAX_TASK_TITLE_LENGTH),
    organizationId: command.organizationId,
    createdById: command.createdById,
    captureId: capture.id,
    actor: command.actor,
    ...(command.dueDate !== undefined ? { dueDate: command.dueDate } : {}),
    ...(command.listId !== undefined ? { listId: command.listId } : {}),
    ...(command.projectId !== undefined ? { projectId: command.projectId } : {}),
  };

  const created = decideCreateTask({
    command: createCommand,
    list,
    project,
    assigneeInOrganization,
    nextOpenOrder,
    id,
    now,
  });

  if (created.isErr()) {
    return err(created.error);
  }

  return ok({
    taskCreated: created.value,
    captureProcessed: {
      type: 'CaptureProcessed',
      id: capture.id,
      organizationId: command.organizationId,
      processedAt: now,
      processedToType: 'task',
      processedToId: id,
      occurredAt: now,
    },
  });
};
