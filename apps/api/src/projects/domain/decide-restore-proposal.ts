import { err, ok, type Result } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import { requirePerson } from '../../shared/auth-context.js';
import type { RestoreDeclinedProjectCommand } from './project-commands.js';
import type { ProjectStatusChanged } from './events.js';
import {
  duplicateProjectNameError,
  projectNotDeclinedError,
  projectRestoreRequiresPersonError,
  type RestoreDeclinedProjectError,
} from './project-errors.js';
import { projectNameIsTaken } from './project-name.js';

export type DecideRestoreProposalInput = {
  project: Project;
  command: RestoreDeclinedProjectCommand;
  existingNames: readonly string[];
  now: string;
};

export type DecideRestoreProposalError = Exclude<
  RestoreDeclinedProjectError,
  { type: 'STORAGE_ERROR' } | { type: 'PROJECT_NOT_FOUND' }
>;

export const decideRestoreProposal = ({
  project,
  command,
  existingNames,
  now,
}: DecideRestoreProposalInput): Result<ProjectStatusChanged, DecideRestoreProposalError> => {
  const person = requirePerson(command.actor);
  if (person.isErr()) {
    return err(projectRestoreRequiresPersonError());
  }

  if (project.status !== 'declined') {
    return err(projectNotDeclinedError(project.id));
  }

  if (projectNameIsTaken(project.name, existingNames)) {
    return err(duplicateProjectNameError(project.name));
  }

  return ok({
    type: 'ProjectStatusChanged',
    id: project.id,
    organizationId: project.organizationId,
    from: 'declined',
    to: 'proposed',
    waitingOn: null,
    waitingSince: null,
    occurredAt: now,
  });
};
