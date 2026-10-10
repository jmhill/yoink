import { err, ok, type Result } from 'neverthrow';
import { requirePerson } from '../../shared/auth-context.js';
import type { CreateProjectCommand } from './project-commands.js';
import type { ProjectCreated } from './events.js';
import {
  duplicateProjectNameError,
  projectCreateRequiresPersonError,
  type DuplicateProjectNameError,
  type InvalidProjectNameError,
  type ProjectCreateRequiresPersonError,
} from './project-errors.js';
import { parseProjectName, projectNameIsTaken } from './project-name.js';
import { parseProjectObjective } from './project-objective.js';

export type DecideCreateProjectInput = {
  command: CreateProjectCommand;
  existingNames: readonly string[];
  id: string;
  now: string;
};

export type DecideCreateProjectError =
  | InvalidProjectNameError
  | DuplicateProjectNameError
  | ProjectCreateRequiresPersonError;

export const decideCreateProject = ({
  command,
  existingNames,
  id,
  now,
}: DecideCreateProjectInput): Result<ProjectCreated, DecideCreateProjectError> => {
  const person = requirePerson(command.actor);
  if (person.isErr()) {
    return err(projectCreateRequiresPersonError());
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
  const event: ProjectCreated = {
    type: 'ProjectCreated',
    id,
    organizationId: command.organizationId,
    createdById: command.createdById,
    name,
    status: 'active',
    createdAt: now,
    occurredAt: now,
  };

  if (objective !== undefined) {
    event.objective = objective;
  }

  return ok(event);
};
