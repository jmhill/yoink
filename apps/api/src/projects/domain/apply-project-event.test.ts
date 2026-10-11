import { describe, it, expect } from 'vitest';
import type { Project } from '@yoink/api-contracts';
import {
  applyProjectCreated,
  applyProjectNextActionCleared,
  applyProjectNextActionSet,
  applyProjectStatusChanged,
  applyProjectUpdated,
  applyProjectWaitingChanged,
} from './apply-project-event.js';
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
      waitingOn: null,
      waitingSince: null,
      nextActionTaskId: null,
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
    waitingOn: null,
    waitingSince: null,
    nextActionTaskId: null,
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

describe('applyProjectStatusChanged', () => {
  const current: Project = {
    id: 'project-id-1',
    organizationId: 'org-123',
    createdById: 'user-456',
    name: 'Garden',
    status: 'active',
    waitingOn: null,
    waitingSince: null,
    nextActionTaskId: null,
    createdAt: '2025-01-15T10:00:00.000Z',
    lastChangedAt: '2025-01-15T10:00:00.000Z',
    lastChangedBy: 'user-456',
  };

  it('sets waiting fields and last-changed', () => {
    expect(
      applyProjectStatusChanged(
        current,
        {
          type: 'ProjectStatusChanged',
          id: current.id,
          organizationId: current.organizationId,
          from: 'active',
          to: 'waiting',
          waitingOn: 'Mike',
          waitingSince: '2026-10-01',
          occurredAt: '2025-01-15T11:00:00.000Z',
        },
        meta
      )
    ).toMatchObject({
      status: 'waiting',
      waitingOn: 'Mike',
      waitingSince: '2026-10-01',
      lastChangedAt: '2025-01-15T11:00:00.000Z',
    });
  });

  it('clears waiting fields when leaving waiting', () => {
    const waiting: Project = {
      ...current,
      status: 'waiting',
      waitingOn: 'Mike',
      waitingSince: '2026-10-01',
    };
    const view = applyProjectStatusChanged(
      waiting,
      {
        type: 'ProjectStatusChanged',
        id: current.id,
        organizationId: current.organizationId,
        from: 'waiting',
        to: 'someday',
        waitingOn: null,
        waitingSince: null,
        occurredAt: '2025-01-15T11:00:00.000Z',
      },
      meta
    );
    expect(view.status).toBe('someday');
    expect(view.waitingOn).toBeNull();
    expect(view.waitingSince).toBeNull();
  });
});

describe('applyProjectWaitingChanged', () => {
  it('updates waiting on and since', () => {
    const waiting: Project = {
      id: 'project-id-1',
      organizationId: 'org-123',
      createdById: 'user-456',
      name: 'Garden',
      status: 'waiting',
      waitingOn: 'Mike',
      waitingSince: '2026-09-28',
      nextActionTaskId: null,
      createdAt: '2025-01-15T10:00:00.000Z',
      lastChangedAt: '2025-01-15T10:00:00.000Z',
      lastChangedBy: 'user-456',
    };

    expect(
      applyProjectWaitingChanged(
        waiting,
        {
          type: 'ProjectWaitingChanged',
          id: waiting.id,
          organizationId: waiting.organizationId,
          waitingOn: 'Trident',
          waitingSince: null,
          occurredAt: '2025-01-15T11:00:00.000Z',
        },
        meta
      )
    ).toMatchObject({
      status: 'waiting',
      waitingOn: 'Trident',
      waitingSince: null,
    });
  });
});

describe('applyProjectNextActionSet', () => {
  it('sets the next action and last-changed', () => {
    const current: Project = {
      id: 'project-id-1',
      organizationId: 'org-123',
      createdById: 'user-456',
      name: 'Garden',
      status: 'active',
      waitingOn: null,
      waitingSince: null,
      nextActionTaskId: null,
      createdAt: '2025-01-15T10:00:00.000Z',
      lastChangedAt: '2025-01-15T10:00:00.000Z',
      lastChangedBy: 'user-456',
    };
    expect(
      applyProjectNextActionSet(
        current,
        {
          type: 'ProjectNextActionSet',
          id: current.id,
          organizationId: current.organizationId,
          taskId: 'task-soil',
          previousTaskId: null,
          occurredAt: '2025-01-15T11:00:00.000Z',
        },
        meta
      )
    ).toMatchObject({
      nextActionTaskId: 'task-soil',
      lastChangedAt: '2025-01-15T11:00:00.000Z',
    });
  });
});

describe('applyProjectNextActionCleared', () => {
  it('clears the next action', () => {
    const current: Project = {
      id: 'project-id-1',
      organizationId: 'org-123',
      createdById: 'user-456',
      name: 'Garden',
      status: 'active',
      waitingOn: null,
      waitingSince: null,
      nextActionTaskId: 'task-soil',
      createdAt: '2025-01-15T10:00:00.000Z',
      lastChangedAt: '2025-01-15T10:00:00.000Z',
      lastChangedBy: 'user-456',
    };
    expect(
      applyProjectNextActionCleared(
        current,
        {
          type: 'ProjectNextActionCleared',
          id: current.id,
          organizationId: current.organizationId,
          taskId: 'task-soil',
          reason: 'completed',
          occurredAt: '2025-01-15T11:00:00.000Z',
        },
        meta
      ).nextActionTaskId
    ).toBeNull();
  });
});
