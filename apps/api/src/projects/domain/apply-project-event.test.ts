import { describe, it, expect } from 'vitest';
import type { Project } from '@yoink/api-contracts';
import { applyProjectCreated, applyProjectUpdated } from './apply-project-event.js';
import type { ProjectCreated } from './events.js';

const meta = { actorUserId: 'user-456' };

describe('applyProjectCreated', () => {
  const event: ProjectCreated = {
    type: 'ProjectCreated',
    id: 'project-id-1',
    organizationId: 'org-123',
    createdById: 'user-456',
    name: 'Garden',
    status: 'active',
    createdAt: '2025-01-15T10:00:00.000Z',
    occurredAt: '2025-01-15T10:00:00.000Z',
  };

  it('projects a project from the fact with last-changed from the actor', () => {
    expect(applyProjectCreated(event, meta)).toEqual({
      id: 'project-id-1',
      organizationId: 'org-123',
      createdById: 'user-456',
      name: 'Garden',
      status: 'active',
      createdAt: '2025-01-15T10:00:00.000Z',
      lastChangedAt: '2025-01-15T10:00:00.000Z',
      lastChangedBy: 'user-456',
    });
  });

  it('includes the objective when present', () => {
    expect(applyProjectCreated({ ...event, objective: 'Grow tomatoes' }, meta).objective).toBe(
      'Grow tomatoes'
    );
  });
});

describe('applyProjectUpdated', () => {
  const current: Project = {
    id: 'project-id-1',
    organizationId: 'org-123',
    createdById: 'user-456',
    name: 'garden',
    objective: 'Grow tomatoes',
    status: 'active',
    createdAt: '2025-01-15T10:00:00.000Z',
    lastChangedAt: '2025-01-15T10:00:00.000Z',
    lastChangedBy: 'user-456',
  };

  it('projects the new name and last-changed', () => {
    expect(
      applyProjectUpdated(
        current,
        {
          type: 'ProjectUpdated',
          id: current.id,
          organizationId: current.organizationId,
          name: 'Garden',
          occurredAt: '2025-01-15T11:00:00.000Z',
        },
        meta
      )
    ).toEqual({
      ...current,
      name: 'Garden',
      lastChangedAt: '2025-01-15T11:00:00.000Z',
      lastChangedBy: 'user-456',
    });
  });

  it('clears the objective when the event sets it to null', () => {
    const view = applyProjectUpdated(
      current,
      {
        type: 'ProjectUpdated',
        id: current.id,
        organizationId: current.organizationId,
        objective: null,
        occurredAt: '2025-01-15T11:00:00.000Z',
      },
      meta
    );

    expect(view.objective).toBeUndefined();
    expect(view.lastChangedAt).toBe('2025-01-15T11:00:00.000Z');
  });
});
