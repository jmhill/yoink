import { err, ok, type Result } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import { requirePerson } from '../../shared/auth-context.js';
import type { ConfirmProposedProjectCommand } from './project-commands.js';
import type { ProjectStatusChanged, ProjectUpdated } from './events.js';
import {
  duplicateProjectNameError,
  projectConfirmRequiresPersonError,
  projectNotProposedError,
  projectWaitingOnRequiredError,
  type ConfirmProposedProjectError,
} from './project-errors.js';
import { normalizeProjectName, parseProjectName, projectNameIsTaken } from './project-name.js';
import { parseProjectObjective } from './project-objective.js';
import { parseSuggestedNextAction } from './project-proposal-fields.js';
import { parseWaitingOn, parseWaitingSince } from './project-waiting.js';

export type DecideConfirmProposalInput = {
  project: Project;
  command: ConfirmProposedProjectCommand;
  existingNames: readonly string[];
  now: string;
};

export type DecideConfirmProposalError = Exclude<
  ConfirmProposedProjectError,
  { type: 'STORAGE_ERROR' } | { type: 'PROJECT_NOT_FOUND' }
>;

export type ConfirmProposalDecision = {
  updated: ProjectUpdated | null;
  statusChanged: ProjectStatusChanged;
  suggestedNextAction: string | undefined;
};

const waitingFieldsFor = (
  command: ConfirmProposedProjectCommand,
  status: 'active' | 'someday' | 'waiting'
): Result<
  { waitingOn: string | null; waitingSince: string | null },
  DecideConfirmProposalError
> => {
  if (status !== 'waiting') {
    return ok({ waitingOn: null, waitingSince: null });
  }

  if (command.waitingOn === undefined || command.waitingOn === null) {
    return err(projectWaitingOnRequiredError());
  }

  const parsedOn = parseWaitingOn(command.waitingOn);
  if (parsedOn.isErr()) {
    return err(parsedOn.error);
  }

  if (command.waitingSince === undefined || command.waitingSince === null) {
    return ok({ waitingOn: parsedOn.value, waitingSince: null });
  }

  const parsedSince = parseWaitingSince(command.waitingSince);
  if (parsedSince.isErr()) {
    return err(parsedSince.error);
  }

  return ok({ waitingOn: parsedOn.value, waitingSince: parsedSince.value });
};

export const decideConfirmProposal = ({
  project,
  command,
  existingNames,
  now,
}: DecideConfirmProposalInput): Result<ConfirmProposalDecision, DecideConfirmProposalError> => {
  const person = requirePerson(command.actor);
  if (person.isErr()) {
    return err(projectConfirmRequiresPersonError());
  }

  if (project.status !== 'proposed') {
    return err(projectNotProposedError(project.id));
  }

  const status = command.status ?? 'active';
  const waiting = waitingFieldsFor(command, status);
  if (waiting.isErr()) {
    return err(waiting.error);
  }

  const updated: ProjectUpdated = {
    type: 'ProjectUpdated',
    id: project.id,
    organizationId: project.organizationId,
    occurredAt: now,
  };

  if (command.name !== undefined) {
    const parsed = parseProjectName(command.name);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    const name = parsed.value;
    if (name !== project.name) {
      const others = existingNames.filter(
        (existing) => normalizeProjectName(existing) !== normalizeProjectName(project.name)
      );
      if (projectNameIsTaken(name, others)) {
        return err(duplicateProjectNameError(name));
      }
      updated.name = name;
    }
  }

  if (command.objective !== undefined) {
    const objective = parseProjectObjective(command.objective);
    if (objective !== project.objective) {
      updated.objective = objective ?? null;
    }
  }

  const suggested =
    command.suggestedNextAction === undefined
      ? ok(project.suggestedNextAction)
      : parseSuggestedNextAction(command.suggestedNextAction);
  if (suggested.isErr()) {
    return err(suggested.error);
  }

  if (suggested.value !== project.suggestedNextAction) {
    updated.suggestedNextAction = suggested.value ?? null;
  }

  const hasUpdate =
    updated.name !== undefined ||
    updated.objective !== undefined ||
    updated.suggestedNextAction !== undefined;

  return ok({
    updated: hasUpdate ? updated : null,
    statusChanged: {
      type: 'ProjectStatusChanged',
      id: project.id,
      organizationId: project.organizationId,
      from: 'proposed',
      to: status,
      waitingOn: waiting.value.waitingOn,
      waitingSince: waiting.value.waitingSince,
      occurredAt: now,
    },
    suggestedNextAction: suggested.value,
  });
};
