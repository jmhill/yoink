import { err, ok, type Result } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { UpdateProjectCommand } from './project-commands.js';
import type { ProjectUpdated } from './events.js';
import {
  duplicateProjectNameError,
  type DuplicateProjectNameError,
  type InvalidProjectNameError,
} from './project-errors.js';
import { normalizeProjectName, parseProjectName, projectNameIsTaken } from './project-name.js';
import { parseProjectObjective } from './project-objective.js';

export type DecideUpdateProjectInput = {
  command: UpdateProjectCommand;
  current: Project;
  existingNames: readonly string[];
  now: string;
};

export type DecideUpdateProjectError = InvalidProjectNameError | DuplicateProjectNameError;

export type DecideUpdateProjectResult =
  | { type: 'changed'; event: ProjectUpdated }
  | { type: 'unchanged' };

export const decideUpdateProject = ({
  command,
  current,
  existingNames,
  now,
}: DecideUpdateProjectInput): Result<DecideUpdateProjectResult, DecideUpdateProjectError> => {
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
    if (name !== current.name) {
      const others = existingNames.filter(
        (existing) => normalizeProjectName(existing) !== normalizeProjectName(current.name)
      );
      if (projectNameIsTaken(name, others)) {
        return err(duplicateProjectNameError(name));
      }
      event.name = name;
    }
  }

  if (command.objective !== undefined) {
    const objective = parseProjectObjective(command.objective);
    if (objective !== current.objective) {
      event.objective = objective ?? null;
    }
  }

  if (event.name === undefined && event.objective === undefined) {
    return ok({ type: 'unchanged' });
  }

  return ok({ type: 'changed', event });
};
