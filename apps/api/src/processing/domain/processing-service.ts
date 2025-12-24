import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { CaptureStore } from '../../captures/domain/capture-store.js';
import type { TaskStore } from '../../tasks/domain/task-store.js';
import type { ProcessCaptureToTaskCommand } from '../../captures/domain/capture-commands.js';
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

export type ProcessingServiceDependencies = {
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

export type ProcessingService = {
  processCaptureToTask: (
    command: ProcessCaptureToTaskCommand
  ) => ResultAsync<Task, ProcessCaptureToTaskError>;
  deleteTaskWithCascade: (
    command: DeleteTaskWithCascadeCommand
  ) => ResultAsync<void, DeleteTaskWithCascadeError>;
};

/**
 * Truncates a string to the specified max length
 */
const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength);
};

export const createProcessingService = (
  deps: ProcessingServiceDependencies
): ProcessingService => {
  const { captureStore, taskStore, clock, idGenerator } = deps;

  return {
    processCaptureToTask: (
      command: ProcessCaptureToTaskCommand
    ): ResultAsync<Task, ProcessCaptureToTaskError> => {
      // First, find and validate the capture
      return captureStore.findById(command.id).andThen((capture) => {
        // Check capture exists and belongs to the organization
        if (!capture || capture.organizationId !== command.organizationId) {
          return errAsync(captureNotFoundError(command.id));
        }

        // Check capture is in inbox status
        if (capture.status !== 'inbox') {
          return errAsync(captureNotInInboxError(command.id));
        }

        // Create the task
        const taskId = idGenerator.generate();
        const task: Task = {
          id: taskId,
          organizationId: command.organizationId,
          createdById: command.createdById,
          title: command.title ?? truncate(capture.content, 500),
          captureId: capture.id,
          dueDate: command.dueDate,
          createdAt: clock.now().toISOString(),
        };

        // Save the task
        return taskStore.save(task).andThen(() => {
          // Mark the capture as processed
          return captureStore
            .markAsProcessed({
              id: capture.id,
              processedAt: clock.now().toISOString(),
              processedToType: 'task',
              processedToId: taskId,
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

        // Delete the task
        return taskStore.softDelete(command.id).andThen(() => {
          // If the task has a source capture, delete it too
          if (task.captureId) {
            return captureStore.softDelete(task.captureId).map(() => undefined);
          }
          return okAsync(undefined);
        });
      });
    },
  };
};
