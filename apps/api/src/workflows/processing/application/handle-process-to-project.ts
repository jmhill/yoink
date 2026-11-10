import type { ResultAsync } from 'neverthrow';
import type { UnitOfWork } from '../../../kernel/unit-of-work.js';
import type { Captures } from '../../../modules/captures/index.js';
import type { TaskManagement } from '../../../modules/task-management/index.js';
import type { ProcessCaptureToProjectCommand } from '../domain/commands.js';
import { toProjectStarter } from '../domain/to-project-starter.js';
import {
  mapProcessToProjectCommit,
  projectPrepareError,
  type ProcessCaptureToProjectError,
} from './map-commit-failure.js';

export type { ProcessCaptureToProjectError };

export type ProcessToProjectDeps = {
  captures: Captures;
  taskManagement: TaskManagement;
  uow: UnitOfWork;
};

const finish = <T>(
  result: ResultAsync<T, ProcessCaptureToProjectError>
): ResultAsync<T, ProcessCaptureToProjectError> => result;

/**
 * Query the inbox capture, prepare a project and a claim, then commit once.
 */
export const handleProcessCaptureToProject = (
  command: ProcessCaptureToProjectCommand,
  deps: ProcessToProjectDeps
) =>
  finish(
    deps.captures.queries
      .findInboxCapture(command.id, command.organizationId)
      .andThen((capture) =>
        deps.taskManagement.prepare
          .createProject(toProjectStarter(command, capture), command.actor)
          .mapErr(projectPrepareError)
          .andThen((projectWork) =>
            deps.captures.prepare
              .markProcessed({
                captureId: capture.id,
                organizationId: command.organizationId,
                to: { kind: 'project', id: projectWork.result.view.id },
                actor: command.actor,
              })
              .map((claimWork) => ({ projectWork, claimWork }))
          )
      )
      .andThen(({ projectWork, claimWork }) =>
        deps.uow
          .commit([claimWork, projectWork])
          .map(() => ({
            project: projectWork.result.view,
            capture: claimWork.result,
          }))
          .mapErr((failure) =>
            mapProcessToProjectCommit(failure, {
              captureId: command.id,
              projectName: projectWork.result.view.name,
            })
          )
      )
  );
