import { err, ok, type Result } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import { requirePerson } from '../../shared/auth-context.js';
import type { ProcessCaptureToProjectCommand } from '../../captures/domain/capture-commands.js';
import {
  captureNotFoundError,
  captureNotInInboxError,
  type CaptureNotFoundError,
  type CaptureNotInInboxError,
} from '../../captures/domain/capture-errors.js';
import type { ProjectCreated } from '../../projects/domain/events.js';
import {
  duplicateProjectNameError,
  projectCreateRequiresPersonError,
  type DuplicateProjectNameError,
  type InvalidProjectNameError,
  type ProjectCreateRequiresPersonError,
  type ProjectNameBlankError,
} from '../../projects/domain/project-errors.js';
import { parseProjectName, projectNameIsTaken } from '../../projects/domain/project-name.js';
import { parseProjectObjective } from '../../projects/domain/project-objective.js';

export type CaptureProcessedToProject = {
  type: 'CaptureProcessed';
  id: string;
  organizationId: string;
  processedAt: string;
  processedToType: 'project';
  processedToId: string;
  occurredAt: string;
};

export type DecideProcessCaptureToProjectInput = {
  command: ProcessCaptureToProjectCommand;
  capture: Capture | null;
  existingNames: readonly string[];
  ids: { projectId: string };
  now: string;
};

export type DecideProcessCaptureToProjectError =
  | ProjectCreateRequiresPersonError
  | CaptureNotFoundError
  | CaptureNotInInboxError
  | InvalidProjectNameError
  | ProjectNameBlankError
  | DuplicateProjectNameError;

export type ProcessCaptureToProjectDecision = {
  projectCreated: ProjectCreated;
  captureProcessed: CaptureProcessedToProject;
};

export const decideProcessCaptureToProject = ({
  command,
  capture,
  existingNames,
  ids,
  now,
}: DecideProcessCaptureToProjectInput): Result<
  ProcessCaptureToProjectDecision,
  DecideProcessCaptureToProjectError
> => {
  const person = requirePerson(command.actor);
  if (person.isErr()) {
    return err(projectCreateRequiresPersonError());
  }

  if (!capture || capture.organizationId !== command.organizationId) {
    return err(captureNotFoundError(command.id));
  }

  if (capture.status !== 'inbox') {
    return err(captureNotInInboxError(command.id));
  }

  const parsed = parseProjectName(command.name);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const name = parsed.value;
  if (projectNameIsTaken(name, existingNames)) {
    return err(duplicateProjectNameError(name));
  }

  const objective = parseProjectObjective(command.objective);

  return ok({
    projectCreated: {
      type: 'ProjectCreated',
      id: ids.projectId,
      organizationId: command.organizationId,
      createdById: command.createdById,
      name,
      status: command.status,
      captureId: capture.id,
      createdAt: now,
      occurredAt: now,
      ...(objective !== undefined ? { objective } : {}),
    },
    captureProcessed: {
      type: 'CaptureProcessed',
      id: capture.id,
      organizationId: command.organizationId,
      processedAt: now,
      processedToType: 'project',
      processedToId: ids.projectId,
      occurredAt: now,
    },
  });
};
