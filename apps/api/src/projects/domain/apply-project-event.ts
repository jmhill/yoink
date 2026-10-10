import type { Project } from '@yoink/api-contracts';
import type { ProjectCreated, ProjectUpdated } from './events.js';

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
): Project => {
  const created: Project = {
    id: event.id,
    organizationId: event.organizationId,
    createdById: event.createdById,
    name: event.name,
    status: event.status,
    createdAt: event.createdAt,
    lastChangedAt: event.occurredAt,
    lastChangedBy: meta.actorUserId,
  };

  if (event.objective !== undefined) {
    created.objective = event.objective;
  }

  return created;
};

export const applyProjectUpdated = (
  current: Project,
  event: ProjectUpdated,
  meta: ApplyProjectMeta
): Project => {
  const next = withLastChanged(current, event.occurredAt, meta);

  if (event.name !== undefined) {
    next.name = event.name;
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
