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

  let name: string | undefined;
  if (command.name !== undefined) {
    const parsed = parseProjectName(command.name);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    const parsedName = parsed.value;
    if (parsedName !== project.name) {
      const others = existingNames.filter(
        (existing) => normalizeProjectName(existing) !== normalizeProjectName(project.name)
      );
      if (projectNameIsTaken(parsedName, others)) {
        return err(duplicateProjectNameError(parsedName));
      }
      name = parsedName;
    }
  }

  let objective: string | null | undefined;
  if (command.objective !== undefined) {
    const parsedObjective = parseProjectObjective(command.objective);
    if (parsedObjective !== project.objective) {
      objective = parsedObjective ?? null;
    }
  }

  const suggested =
    command.suggestedNextAction === undefined
      ? ok(project.suggestedNextAction)
      : parseSuggestedNextAction(command.suggestedNextAction);
  if (suggested.isErr()) {
    return err(suggested.error);
  }

  const suggestedNextAction =
    suggested.value !== project.suggestedNextAction ? (suggested.value ?? null) : undefined;

  const hasUpdate =
    name !== undefined || objective !== undefined || suggestedNextAction !== undefined;

  const updated: ProjectUpdated | null = hasUpdate
    ? {
        type: 'ProjectUpdated',
        id: project.id,
        organizationId: project.organizationId,
        occurredAt: now,
        ...(name !== undefined ? { name } : {}),
        ...(objective !== undefined ? { objective } : {}),
        ...(suggestedNextAction !== undefined ? { suggestedNextAction } : {}),
      }
    : null;

  return ok({
    updated,
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
