import { err, ok, type Result } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { UpdateProjectCommand } from './project-commands.js';
import type { ProjectUpdated } from './events.js';
import {
  duplicateProjectNameError,
  type DuplicateProjectNameError,
  type InvalidProjectNameError,
  type InvalidProjectReasonError,
  type InvalidSuggestedNextActionError,
  type ProjectNameBlankError,
} from './project-errors.js';
import { parseProjectReason, parseSuggestedNextAction } from './project-proposal-fields.js';
import { normalizeProjectName, parseProjectName, projectNameIsTaken } from './project-name.js';
import { parseProjectObjective } from './project-objective.js';
import { notebookPagesEqual, parseNotebookPages } from './notebook-pages.js';
import type {
  InvalidNotebookPathError,
  NotebookPageDuplicateError,
  NotebookPagesTooManyError,
} from './notebook-pages.js';

export type DecideUpdateProjectInput = {
  command: UpdateProjectCommand;
  current: Project;
  existingNames: readonly string[];
  now: string;
};

export type DecideUpdateProjectError =
  | InvalidProjectNameError
  | ProjectNameBlankError
  | DuplicateProjectNameError
  | InvalidNotebookPathError
  | NotebookPageDuplicateError
  | NotebookPagesTooManyError
  | InvalidProjectReasonError
  | InvalidSuggestedNextActionError;

export type DecideUpdateProjectResult =
  | { type: 'changed'; event: ProjectUpdated }
  | { type: 'unchanged' };

export const decideUpdateProject = ({
  command,
  current,
  existingNames,
  now,
}: DecideUpdateProjectInput): Result<DecideUpdateProjectResult, DecideUpdateProjectError> => {
  let name: string | undefined;
  if (command.name !== undefined) {
    const parsed = parseProjectName(command.name);
    if (parsed.isErr()) {
      return err(parsed.error);
    }

    const parsedName = parsed.value;
    if (parsedName !== current.name) {
      const others = existingNames.filter(
        (existing) => normalizeProjectName(existing) !== normalizeProjectName(current.name)
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
    if (parsedObjective !== current.objective) {
      objective = parsedObjective ?? null;
    }
  }

  let notebookPages: string[] | undefined;
  if (command.notebookPages !== undefined) {
    const parsed = parseNotebookPages(command.notebookPages);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    const currentPaths = current.notebookPages.map((page) => page.path);
    if (!notebookPagesEqual(parsed.value, currentPaths)) {
      notebookPages = parsed.value;
    }
  }

  let reason: string | null | undefined;
  if (command.reason !== undefined) {
    const parsed = parseProjectReason(command.reason);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    const parsedReason = parsed.value ?? null;
    if (parsedReason !== (current.reason ?? null)) {
      reason = parsedReason;
    }
  }

  let suggestedNextAction: string | null | undefined;
  if (command.suggestedNextAction !== undefined) {
    const parsed = parseSuggestedNextAction(command.suggestedNextAction);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    const suggested = parsed.value ?? null;
    if (suggested !== (current.suggestedNextAction ?? null)) {
      suggestedNextAction = suggested;
    }
  }

  if (
    name === undefined &&
    objective === undefined &&
    notebookPages === undefined &&
    reason === undefined &&
    suggestedNextAction === undefined
  ) {
    return ok({ type: 'unchanged' });
  }

  const event: ProjectUpdated = {
    type: 'ProjectUpdated',
    id: current.id,
    organizationId: current.organizationId,
    occurredAt: now,
    ...(name !== undefined ? { name } : {}),
    ...(objective !== undefined ? { objective } : {}),
    ...(notebookPages !== undefined ? { notebookPages } : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(suggestedNextAction !== undefined ? { suggestedNextAction } : {}),
  };

  return ok({ type: 'changed', event });
};
