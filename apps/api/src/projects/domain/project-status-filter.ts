import { err, ok, type Result } from 'neverthrow';
import {
  ProjectStatusSchema,
  WORKING_PROJECT_STATUSES,
  type ProjectStatus,
} from '@yoink/api-contracts';
import {
  invalidProjectStatusError,
  type InvalidProjectStatusError,
} from './project-errors.js';

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

  const parsed = parts.map((part) => ProjectStatusSchema.safeParse(part));
  if (parsed.some((item) => !item.success)) {
    return err(invalidProjectStatusError());
  }

  const unique: ProjectStatus[] = [];
  for (const item of parsed) {
    if (!item.success) {
      return err(invalidProjectStatusError());
    }
    if (!unique.some((status) => status === item.data)) {
      unique.push(item.data);
    }
  }

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
