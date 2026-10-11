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
});

export const applyProjectUpdated = (
  current: Project,
  event: ProjectUpdated,
  meta: ApplyProjectMeta
): Project => {
  const next = withLastChanged(current, event.occurredAt, meta);

  if (event.name !== undefined) {
    next.name = event.name;
  }

  if (event.notebookPages !== undefined) {
    next.notebookPages = notebookPagesFromPaths(event.notebookPages);
  }

  if (event.objective === undefined) {
    return next;
  }

  if (event.objective === null) {
    const { objective: _cleared, ...rest } = next;
    return rest;
  }

  next.objective = event.objective;
  return next;
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
