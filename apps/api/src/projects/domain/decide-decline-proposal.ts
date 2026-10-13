import { err, ok, type Result } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import { requirePerson } from '../../shared/auth-context.js';
import type { DeclineProposedProjectCommand } from './project-commands.js';
import type { ProjectStatusChanged } from './events.js';
import {
  projectDeclineRequiresPersonError,
  projectNotProposedError,
  type DeclineProposedProjectError,
} from './project-errors.js';

export type DecideDeclineProposalInput = {
  project: Project;
  command: DeclineProposedProjectCommand;
  now: string;
};

export type DecideDeclineProposalError = Exclude<
  DeclineProposedProjectError,
  { type: 'STORAGE_ERROR' } | { type: 'PROJECT_NOT_FOUND' }
>;

export const decideDeclineProposal = ({
  project,
  command,
  now,
}: DecideDeclineProposalInput): Result<ProjectStatusChanged, DecideDeclineProposalError> => {
  const person = requirePerson(command.actor);
  if (person.isErr()) {
    return err(projectDeclineRequiresPersonError());
  }

  if (project.status !== 'proposed') {
    return err(projectNotProposedError(project.id));
  }

  return ok({
    type: 'ProjectStatusChanged',
    id: project.id,
    organizationId: project.organizationId,
    from: 'proposed',
    to: 'declined',
    waitingOn: null,
    waitingSince: null,
    occurredAt: now,
  });
};
