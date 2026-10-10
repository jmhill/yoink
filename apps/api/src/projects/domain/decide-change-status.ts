import { err, ok, type Result } from 'neverthrow';
import type { AssignableProjectStatus, Project } from '@yoink/api-contracts';
import { requirePerson } from '../../shared/auth-context.js';
import type { ChangeProjectStatusCommand } from './project-commands.js';
import type { ProjectStatusChanged, ProjectWaitingChanged } from './events.js';
import {
  invalidProjectStatusError,
  projectDoneRequiresPersonError,
  projectHasOpenTasksError,
  projectReopenRequiresPersonError,
  projectWaitingOnRequiredError,
  type ChangeProjectStatusError,
} from './project-errors.js';
import { parseWaitingOn, parseWaitingSince } from './project-waiting.js';

const ASSIGNABLE_STATUSES: readonly AssignableProjectStatus[] = [
  'active',
  'waiting',
  'someday',
  'done',
];

const isAssignableStatus = (status: string): status is AssignableProjectStatus =>
  ASSIGNABLE_STATUSES.some((value) => value === status);

export type DecideChangeProjectStatusInput = {
  project: Project;
  openTaskCount: number;
  command: ChangeProjectStatusCommand;
  now: string;
};

export type DecideChangeProjectStatusResult =
  | { type: 'unchanged' }
  | { type: 'changed'; event: ProjectStatusChanged | ProjectWaitingChanged };

export const decideChangeProjectStatus = ({
  project,
  openTaskCount,
  command,
  now,
}: DecideChangeProjectStatusInput): Result<
  DecideChangeProjectStatusResult,
  ChangeProjectStatusError
> => {
  if (!isAssignableStatus(command.status)) {
    return err(invalidProjectStatusError());
  }

  const statusChanging = command.status !== project.status;

  if (statusChanging && command.status === 'done') {
    const person = requirePerson(command.actor);
    if (person.isErr()) {
      return err(projectDoneRequiresPersonError());
    }
    if (openTaskCount > 0 && command.openTasks === undefined) {
      return err(projectHasOpenTasksError(openTaskCount));
    }
  }

  if (statusChanging && project.status === 'done') {
    const person = requirePerson(command.actor);
    if (person.isErr()) {
      return err(projectReopenRequiresPersonError());
    }
  }

  const waiting = waitingFieldsFor(project, command);
  if (waiting.isErr()) {
    return err(waiting.error);
  }

  const { waitingOn, waitingSince } = waiting.value;
  const sameWaiting =
    (project.waitingOn ?? null) === waitingOn && (project.waitingSince ?? null) === waitingSince;

  if (!statusChanging && sameWaiting) {
    return ok({ type: 'unchanged' });
  }

  if (!statusChanging) {
    if (waitingOn === null) {
      return err(projectWaitingOnRequiredError());
    }
    return ok({
      type: 'changed',
      event: {
        type: 'ProjectWaitingChanged',
        id: project.id,
        organizationId: project.organizationId,
        waitingOn,
        waitingSince,
        occurredAt: now,
      },
    });
  }

  return ok({
    type: 'changed',
    event: {
      type: 'ProjectStatusChanged',
      id: project.id,
      organizationId: project.organizationId,
      from: project.status,
      to: command.status,
      waitingOn,
      waitingSince,
      occurredAt: now,
    },
  });
};

const waitingFieldsFor = (
  project: Project,
  command: ChangeProjectStatusCommand
): Result<
  { waitingOn: string | null; waitingSince: string | null },
  ChangeProjectStatusError
> => {
  if (command.status !== 'waiting') {
    return ok({ waitingOn: null, waitingSince: null });
  }

  if (command.waitingOn === undefined) {
    if (project.status === 'waiting' && project.waitingOn) {
      return waitingSinceFor(project, command, project.waitingOn);
    }
    return err(projectWaitingOnRequiredError());
  }

  if (command.waitingOn === null) {
    return err(projectWaitingOnRequiredError());
  }

  const parsed = parseWaitingOn(command.waitingOn);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  return waitingSinceFor(project, command, parsed.value);
};

const waitingSinceFor = (
  project: Project,
  command: ChangeProjectStatusCommand,
  waitingOn: string
): Result<
  { waitingOn: string; waitingSince: string | null },
  ChangeProjectStatusError
> => {
  if (command.waitingSince === undefined) {
    return ok({
      waitingOn,
      waitingSince: project.status === 'waiting' ? (project.waitingSince ?? null) : null,
    });
  }

  if (command.waitingSince === null) {
    return ok({ waitingOn, waitingSince: null });
  }

  const parsed = parseWaitingSince(command.waitingSince);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  return ok({ waitingOn, waitingSince: parsed.value });
};
