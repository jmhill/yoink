import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { CaptureStore } from '../../captures/domain/capture-store.js';
import type { TaskStore } from '../../tasks/domain/task-store.js';
import type { ProcessCaptureToTaskCommand } from '../../captures/domain/capture-commands.js';
import {
  captureNotFoundError,
  type CaptureNotFoundError,
  type CaptureNotInInboxError,
  type StorageError,
} from '../../captures/domain/capture-errors.js';
import {
  taskNotFoundError,
  type TaskNotFoundError,
} from '../../tasks/domain/task-errors.js';

export type CaptureProcessingServiceDependencies = {
  captureStore: CaptureStore;
  taskStore: TaskStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

export type ProcessCaptureToTaskError =
  | StorageError
  | CaptureNotFoundError
  | CaptureNotInInboxError;

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
  const { captureStore, taskStore, clock, idGenerator } = deps;

  return {
    processCaptureToTask: (
      command: ProcessCaptureToTaskCommand
    ): ResultAsync<Task, ProcessCaptureToTaskError> => {
      // First, find the capture (outside transaction for read)
      return captureStore.findById(command.id).andThen((capture) => {
        // Check capture exists and belongs to the organization
        if (!capture || capture.organizationId !== command.organizationId) {
          return errAsync(captureNotFoundError(command.id));
        }

        // Create the task
        const taskId = idGenerator.generate();
        const task: Task = {
          id: taskId,
          organizationId: command.organizationId,
          createdById: command.createdById,
          title: command.title ?? truncate(capture.content, MAX_TASK_TITLE_LENGTH),
          captureId: capture.id,
          dueDate: command.dueDate,
          createdAt: clock.now().toISOString(),
        };

        // Execute operations sequentially
        // Note: withTransaction doesn't work with Turso HTTP (each execute is a separate request)
        // The requiredStatus check provides atomicity for the status verification
        return taskStore.save(task).andThen(() => {
          return captureStore
            .markAsProcessed({
              id: capture.id,
              processedAt: clock.now().toISOString(),
              processedToType: 'task',
              processedToId: taskId,
              // Atomic status verification: will fail if capture is no longer in 'inbox' status
              requiredStatus: 'inbox',
            })
            .map(() => task);
        });
      });
    },

    deleteTaskWithCascade: (
      command: DeleteTaskWithCascadeCommand
    ): ResultAsync<void, DeleteTaskWithCascadeError> => {
      // First, find and validate the task
      return taskStore.findById(command.id).andThen((task) => {
        // Check task exists and belongs to the organization
        if (!task || task.organizationId !== command.organizationId) {
          return errAsync(taskNotFoundError(command.id));
        }

        // Delete the task first
        // Note: Not using withTransaction because it doesn't work with Turso HTTP
        return taskStore.softDelete(command.id).andThen(() => {
          // If the task has a source capture, delete it too
          if (task.captureId) {
            return captureStore.softDelete(task.captureId);
          }
          return okAsync(undefined);
        });
      });
    },
  };
};
