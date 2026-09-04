import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { Clock } from '@yoink/infrastructure';
import type { CaptureStore } from '../../captures/domain/capture-store.js';
import type { TaskStore } from '../../tasks/domain/task-store.js';
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
import {
  taskNotFoundError,
  type TaskNotFoundError,
} from '../../tasks/domain/task-errors.js';

export type CreateTaskFromProcess = (
  command: CreateTaskCommand
) => ResultAsync<Task, CreateTaskError>;

export type CaptureProcessingServiceDependencies = {
  captureStore: CaptureStore;
  taskStore: TaskStore;
  createTask: CreateTaskFromProcess;
  clock: Clock;
};

export type ProcessCaptureToTaskError =
  | StorageError
  | CaptureNotFoundError
  | CaptureNotInInboxError
  | CreateTaskError;

export type DeleteTaskWithCascadeCommand = {
  id: string;
  organizationId: string;
};

export type DeleteTaskWithCascadeError = StorageError | TaskNotFoundError;

export type CaptureProcessingService = {
  processCaptureToTask: (
    command: ProcessCaptureToTaskCommand
  ) => ResultAsync<Task, ProcessCaptureToTaskError>;
  deleteTaskWithCascade: (
    command: DeleteTaskWithCascadeCommand
  ) => ResultAsync<void, DeleteTaskWithCascadeError>;
};

/**
 * Maximum length for task titles derived from capture content
 */
const MAX_TASK_TITLE_LENGTH = 100;

/**
 * Truncates a string to the specified max length
 */
const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength);
};

export const createCaptureProcessingService = (
  deps: CaptureProcessingServiceDependencies
): CaptureProcessingService => {
  const { captureStore, taskStore, createTask, clock } = deps;

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
        };
        if (command.dueDate !== undefined) {
          createCommand.dueDate = command.dueDate;
        }
        if (command.listId !== undefined) {
          createCommand.listId = command.listId;
        }

        // Reuse create-task sandwich: decideCreateTask + list open-order join.
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

    deleteTaskWithCascade: (
      command: DeleteTaskWithCascadeCommand
    ): ResultAsync<void, DeleteTaskWithCascadeError> => {
      return taskStore.findById(command.id).andThen((task) => {
        if (!task || task.organizationId !== command.organizationId) {
          return errAsync(taskNotFoundError(command.id));
        }

        return taskStore.softDelete(command.id).andThen(() => {
          if (task.captureId) {
            return captureStore.softDelete(task.captureId);
          }
          return okAsync(undefined);
        });
      });
    },
  };
};
