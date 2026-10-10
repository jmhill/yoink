import { err, ok, type Result } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { UpdateProjectCommand } from './project-commands.js';
import type { ProjectUpdated } from './events.js';
import {
  duplicateProjectNameError,
  projectNotFoundError,
  type DuplicateProjectNameError,
  type InvalidProjectNameError,
  type ProjectNotFoundError,
} from './project-errors.js';
import { normalizeProjectName, parseProjectName, projectNameIsTaken } from './project-name.js';
import { parseProjectObjective } from './project-objective.js';

export type DecideUpdateProjectInput = {
  command: UpdateProjectCommand;
  current: Project | null;
  existingNames: readonly string[];
  now: string;
};

export type DecideUpdateProjectError =
  | InvalidProjectNameError
  | DuplicateProjectNameError
  | ProjectNotFoundError;

export const decideUpdateProject = ({
  command,
  current,
  existingNames,
  now,
}: DecideUpdateProjectInput): Result<ProjectUpdated, DecideUpdateProjectError> => {
  if (!current || current.organizationId !== command.organizationId) {
    return err(projectNotFoundError(command.id));
  }

  const event: ProjectUpdated = {
    type: 'ProjectUpdated',
    id: current.id,
    organizationId: current.organizationId,
    occurredAt: now,
  };

  if (command.name !== undefined) {
    const parsed = parseProjectName(command.name);
    if (parsed.isErr()) {
      return err(parsed.error);
    }

    const name = parsed.value;
    const others = existingNames.filter(
      (existing) => normalizeProjectName(existing) !== normalizeProjectName(current.name)
    );
    if (projectNameIsTaken(name, others)) {
      return err(duplicateProjectNameError(name));
    }

    event.name = name;
  }

  if (command.objective !== undefined) {
    const objective = parseProjectObjective(command.objective);
    event.objective = objective ?? null;
  }

  return ok(event);
};
