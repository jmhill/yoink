import { err, ok, type Result } from 'neverthrow';
import {
  isProjectStatus,
  WORKING_PROJECT_STATUSES,
  type ProjectStatus,
} from '../model/project-document.js';
import {
  invalidProjectStatusError,
  type InvalidProjectStatusError,
} from '../messages/project-errors.js';

export const DEFAULT_LIST_PROJECT_STATUSES: readonly ProjectStatus[] = WORKING_PROJECT_STATUSES;

export const parseProjectStatusFilter = (
  raw: string | undefined
): Result<readonly ProjectStatus[], InvalidProjectStatusError> => {
  if (raw === undefined) {
    return ok(DEFAULT_LIST_PROJECT_STATUSES);
  }

  const parts = raw.split(',').map((part) => part.trim());
  if (parts.some((part) => part.length < 1)) {
    return err(invalidProjectStatusError());
  }

  const parsed = parts.filter(isProjectStatus);
  if (parsed.length !== parts.length) {
    return err(invalidProjectStatusError());
  }

  const unique = [...new Set(parsed)];

  if (unique.length < 1) {
    return err(invalidProjectStatusError());
  }

  return ok(unique);
};

export const heldProjectNames = (
  projects: readonly { name: string; status: ProjectStatus }[]
): readonly string[] =>
  projects.filter((project) => project.status !== 'declined').map((project) => project.name);

export const listIncludesProposalStatuses = (
  statuses: readonly ProjectStatus[]
): boolean => statuses.some((status) => status === 'proposed' || status === 'declined');
