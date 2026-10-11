import { errAsync, type ResultAsync } from 'neverthrow';
import type { Capture, Project } from '@yoink/api-contracts';
import type { ProcessCaptureToProjectCommand } from '../../captures/domain/capture-commands.js';
import {
  captureNotFoundError,
  type CaptureNotFoundError,
  type CaptureNotInInboxError,
  type StorageError as CaptureStorageError,
} from '../../captures/domain/capture-errors.js';
import type {
  DuplicateProjectNameError,
  InvalidProjectNameError,
  ProjectCreateRequiresPersonError,
  ProjectNameBlankError,
  StorageError as ProjectStorageError,
} from '../../projects/domain/project-errors.js';
import { decideProcessCaptureToProject } from '../domain/decide-process-to-project.js';
import { applyCaptureProcessed } from '../domain/apply-capture-processed.js';
import { planProjectChange } from '../../projects/domain/plan-project-change.js';
import type { ListProjects, LoadCapture, PersistProcessToProject } from './ports.js';

export type HandleProcessCaptureToProjectDeps = {
  loadCapture: LoadCapture;
  listProjects: ListProjects;
  persist: PersistProcessToProject;
  nextId: () => string;
  now: () => string;
};

export type ProcessCaptureToProjectError =
  | CaptureStorageError
  | ProjectStorageError
  | CaptureNotFoundError
  | CaptureNotInInboxError
  | ProjectCreateRequiresPersonError
  | InvalidProjectNameError
  | ProjectNameBlankError
  | DuplicateProjectNameError;

export type ProcessCaptureToProjectResult = {
  project: Project;
  capture: Capture;
};

export const handleProcessCaptureToProject = (
  command: ProcessCaptureToProjectCommand,
  deps: HandleProcessCaptureToProjectDeps
): ResultAsync<ProcessCaptureToProjectResult, ProcessCaptureToProjectError> => {
  return deps.loadCapture(command.id).andThen((capture) =>
    deps.listProjects(command.organizationId).andThen((existing) => {
      const now = deps.now();
      const decision = decideProcessCaptureToProject({
        command,
        capture,
        existingNames: existing.map((project) => project.name),
        ids: { projectId: deps.nextId() },
        now,
      });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }
      if (capture === null) {
        return errAsync(captureNotFoundError(command.id));
      }

      const { projectCreated, captureProcessed } = decision.value;
      const plan = planProjectChange({
        event: projectCreated,
        current: null,
        actor: command.actor,
        ids: { recordId: deps.nextId() },
      });

      const view = applyCaptureProcessed(capture, captureProcessed);

      return deps
        .persist({
          project: plan,
          capture: {
            id: captureProcessed.id,
            organizationId: captureProcessed.organizationId,
            processedAt: captureProcessed.processedAt,
            processedToType: captureProcessed.processedToType,
            processedToId: captureProcessed.processedToId,
          },
        })
        .map(() => ({
          project: plan.view,
          capture: view,
        }));
    })
  );
};
