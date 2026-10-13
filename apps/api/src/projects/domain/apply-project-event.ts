import type { Project } from '@yoink/api-contracts';
import { notebookPagesFromPaths } from './notebook-pages.js';
import type {
  ProjectCreated,
  ProjectNextActionCleared,
  ProjectNextActionSet,
  ProjectStatusChanged,
  ProjectUpdated,
  ProjectWaitingChanged,
} from './events.js';

export type ApplyProjectMeta = {
  actorUserId: string | null;
};

const withLastChanged = (
  project: Project,
  occurredAt: string,
  meta: ApplyProjectMeta
): Project => ({
  ...project,
  lastChangedAt: occurredAt,
  lastChangedBy: meta.actorUserId,
});

export const applyProjectCreated = (
  event: ProjectCreated,
  meta: ApplyProjectMeta
): Project => ({
  id: event.id,
  organizationId: event.organizationId,
  createdById: event.createdById,
  name: event.name,
  status: event.status,
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdAt: event.createdAt,
  lastChangedAt: event.occurredAt,
  lastChangedBy: meta.actorUserId,
  ...(event.objective !== undefined ? { objective: event.objective } : {}),
  ...(event.reason !== undefined ? { reason: event.reason } : {}),
  ...(event.suggestedNextAction !== undefined
    ? { suggestedNextAction: event.suggestedNextAction }
    : {}),
});

export const applyProjectUpdated = (
  current: Project,
  event: ProjectUpdated,
  meta: ApplyProjectMeta
): Project => {
  const next: Project = {
    ...withLastChanged(current, event.occurredAt, meta),
    ...(event.name !== undefined ? { name: event.name } : {}),
    ...(event.notebookPages !== undefined
      ? { notebookPages: notebookPagesFromPaths(event.notebookPages) }
      : {}),
  };

  const withReason =
    event.reason === undefined
      ? next
      : event.reason === null
        ? omitField(next, 'reason')
        : { ...next, reason: event.reason };

  const withSuggested =
    event.suggestedNextAction === undefined
      ? withReason
      : event.suggestedNextAction === null
        ? omitField(withReason, 'suggestedNextAction')
        : { ...withReason, suggestedNextAction: event.suggestedNextAction };

  if (event.objective === undefined) {
    return withSuggested;
  }

  if (event.objective === null) {
    return omitField(withSuggested, 'objective');
  }

  return { ...withSuggested, objective: event.objective };
};

const omitField = <T extends Project, K extends keyof Project>(
  project: T,
  key: K
): Omit<T, K> => {
  const { [key]: _removed, ...rest } = project;
  return rest;
};

export const applyProjectStatusChanged = (
  current: Project,
  event: ProjectStatusChanged,
  meta: ApplyProjectMeta
): Project => ({
  ...withLastChanged(current, event.occurredAt, meta),
  status: event.to,
  waitingOn: event.waitingOn,
  waitingSince: event.waitingSince,
});

export const applyProjectWaitingChanged = (
  current: Project,
  event: ProjectWaitingChanged,
  meta: ApplyProjectMeta
): Project => ({
  ...withLastChanged(current, event.occurredAt, meta),
  status: 'waiting',
  waitingOn: event.waitingOn,
  waitingSince: event.waitingSince,
});

export const applyProjectNextActionSet = (
  current: Project,
  event: ProjectNextActionSet,
  meta: ApplyProjectMeta
): Project => ({
  ...withLastChanged(current, event.occurredAt, meta),
  nextActionTaskId: event.taskId,
});

export const applyProjectNextActionCleared = (
  current: Project,
  event: ProjectNextActionCleared,
  meta: ApplyProjectMeta
): Project => ({
  ...withLastChanged(current, event.occurredAt, meta),
  nextActionTaskId: null,
});
