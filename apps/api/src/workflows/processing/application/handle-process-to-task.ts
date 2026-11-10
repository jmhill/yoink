import type { ResultAsync } from 'neverthrow';
import type { UnitOfWork } from '../../../kernel/unit-of-work.js';
import type { Captures } from '../../../modules/captures/index.js';
import type { TaskManagement } from '../../../modules/task-management/index.js';
import type { ProcessCaptureToTaskCommand } from '../domain/commands.js';
import { toTaskStarter } from '../domain/to-task-starter.js';
import {
  mapProcessToTaskCommit,
  type ProcessCaptureToTaskError,
} from './map-commit-failure.js';

export type { ProcessCaptureToTaskError };

export type ProcessToTaskDeps = {
  captures: Captures;
  taskManagement: TaskManagement;
  uow: UnitOfWork;
};

const finish = <T>(
  result: ResultAsync<T, ProcessCaptureToTaskError>
): ResultAsync<T, ProcessCaptureToTaskError> => result;

/**
 * Query the inbox capture, prepare a task and a claim, then commit once.
 * A captures guard miss is the same CAPTURE_NOT_IN_INBOX the query returns.
 */
export const handleProcessCaptureToTask = (
  command: ProcessCaptureToTaskCommand,
  deps: ProcessToTaskDeps
) =>
  finish(
    deps.captures.queries
      .findInboxCapture(command.id, command.organizationId)
      .andThen((capture) =>
        deps.taskManagement.prepare
          .createTask(toTaskStarter(command, capture), command.actor)
          .andThen((taskWork) =>
            deps.captures.prepare
              .markProcessed({
                captureId: capture.id,
                organizationId: command.organizationId,
                to: { kind: 'task', id: taskWork.result.view.id },
                actor: command.actor,
              })
              .map((claimWork) => ({ taskWork, claimWork }))
          )
      )
      .andThen(({ taskWork, claimWork }) =>
        deps.uow
          .commit([claimWork, taskWork])
          .map(() => taskWork.result.view)
          .mapErr((failure) => mapProcessToTaskCommit(failure, command.id))
      )
  );
