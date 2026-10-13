import { err, ok, type Result } from 'neverthrow';
import { requirePerson } from '../../shared/auth-context.js';
import type { CreateProjectCommand } from './project-commands.js';
import type { ProjectCreated } from './events.js';
import {
  duplicateProjectNameError,
  invalidProjectStatusError,
  projectCreateRequiresPersonError,
  projectProposeRequiresBotError,
  type CreateProjectError,
} from './project-errors.js';
import { parseProjectName, projectNameIsTaken } from './project-name.js';
import { parseProjectObjective } from './project-objective.js';
import { parseProjectReason, parseSuggestedNextAction } from './project-proposal-fields.js';

export type DecideCreateProjectInput = {
  command: CreateProjectCommand;
  existingNames: readonly string[];
  id: string;
  now: string;
};

export type DecideCreateProjectError = Exclude<CreateProjectError, { type: 'STORAGE_ERROR' }>;

const statusForActor = (
  command: CreateProjectCommand
): Result<'active' | 'someday' | 'proposed', DecideCreateProjectError> => {
  const requested = command.status;
  const person = requirePerson(command.actor);

  if (person.isOk()) {
    if (requested === 'proposed') {
      return err(projectProposeRequiresBotError());
    }
    if (requested !== undefined && requested !== 'active' && requested !== 'someday') {
      return err(invalidProjectStatusError());
    }
    return ok(requested ?? 'active');
  }

  if (requested !== 'proposed') {
    return err(projectCreateRequiresPersonError());
  }
  return ok('proposed');
};

export const decideCreateProject = ({
  command,
  existingNames,
  id,
  now,
}: DecideCreateProjectInput): Result<ProjectCreated, DecideCreateProjectError> => {
  const status = statusForActor(command);
  if (status.isErr()) {
    return err(status.error);
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
  const reason = parseProjectReason(command.reason);
  if (reason.isErr()) {
    return err(reason.error);
  }
  const suggestedNextAction = parseSuggestedNextAction(command.suggestedNextAction);
  if (suggestedNextAction.isErr()) {
    return err(suggestedNextAction.error);
  }

  return ok({
    type: 'ProjectCreated',
    id,
    organizationId: command.organizationId,
    createdById: command.createdById,
    name,
    status: status.value,
    createdAt: now,
    occurredAt: now,
    ...(objective !== undefined ? { objective } : {}),
    ...(reason.value !== undefined ? { reason: reason.value } : {}),
    ...(suggestedNextAction.value !== undefined
      ? { suggestedNextAction: suggestedNextAction.value }
      : {}),
  });
};
