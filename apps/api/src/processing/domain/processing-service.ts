import { errAsync, ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { Clock } from '@yoink/infrastructure';
import type { CaptureStore } from '../../captures/domain/capture-store.js';
import type { ProcessCaptureToTaskCommand } from '../../captures/domain/capture-commands.js';
import type { CreateTaskCommand } from '../../tasks/domain/task-commands.js';
import type { CreateTaskError } from '../../tasks/domain/task-errors.js';
import {
  captureNotFoundError,
  captureNotInInboxError,
  type CaptureNotFoundError,
  type CaptureNotInInboxError,
  type StorageError,
} from '../../captures/domain/capture-errors.js';

export type CreateTaskFromProcess = (
  command: CreateTaskCommand
) => ResultAsync<Task, CreateTaskError>;

export type CaptureProcessingServiceDependencies = {
  captureStore: CaptureStore;
  createTask: CreateTaskFromProcess;
  clock: Clock;
};

export type ProcessCaptureToTaskError =
  | StorageError
  | CaptureNotFoundError
  | CaptureNotInInboxError
  | CreateTaskError;

export type CaptureProcessingService = {
  processCaptureToTask: (
    command: ProcessCaptureToTaskCommand
  ) => ResultAsync<Task, ProcessCaptureToTaskError>;
};

const MAX_TASK_TITLE_LENGTH = 100;

const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength);
};

export const createCaptureProcessingService = (
  deps: CaptureProcessingServiceDependencies
): CaptureProcessingService => {
  const { captureStore, createTask, clock } = deps;

  return {
    processCaptureToTask: (
      command: ProcessCaptureToTaskCommand
    ): ResultAsync<Task, ProcessCaptureToTaskError> => {
      return captureStore.findById(command.id).andThen((capture) => {
        if (!capture || capture.organizationId !== command.organizationId) {
          return errAsync(captureNotFoundError(command.id));
        }

        if (capture.status !== 'inbox') {
          return errAsync(captureNotInInboxError(command.id));
        }

        const createCommand: CreateTaskCommand = {
          title: command.title ?? truncate(capture.content, MAX_TASK_TITLE_LENGTH),
          organizationId: command.organizationId,
          createdById: command.createdById,
          captureId: capture.id,
          actor: null,
        };
        if (command.dueDate !== undefined) {
          createCommand.dueDate = command.dueDate;
        }
        if (command.listId !== undefined) {
          createCommand.listId = command.listId;
        }

        return createTask(createCommand).andThen((task) => {
          return captureStore
            .markAsProcessed({
              id: capture.id,
              processedAt: clock.now().toISOString(),
              processedToType: 'task',
              processedToId: task.id,
              requiredStatus: 'inbox',
            })
            .map(() => task);
        });
      });
    },
  };
};
