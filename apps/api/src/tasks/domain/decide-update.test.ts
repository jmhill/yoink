import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { decideUpdateTask } from './decide-update.js';

const current: Task = {
  id: 'task-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
lastChangedAt: null,
lastChangedBy: null,
completedBy: null,
};

const groceries = { id: 'list-groceries', organizationId: 'org-123' };
const weekend = { id: 'list-weekend', organizationId: 'org-123' };
const otherOrgList = { id: 'list-other', organizationId: 'org-other' };

describe('decideUpdateTask', () => {
  it('sets a list on an unlisted open task', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: groceries.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: groceries,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'TaskUpdated',
        id: 'task-123',
        organizationId: 'org-123',
        title: undefined,
        dueDate: undefined,
        assigneeId: undefined,
        listId: 'list-groceries',
        projectId: undefined,
        openOrder: 0,
        occurredAt: '2025-01-15T10:00:00.000Z',
      });
    }
  });

  it('appends an existing open task at the end when moving onto a list', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: groceries.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: groceries,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 4,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'TaskUpdated') {
      expect(result.value.listId).toBe('list-groceries');
      expect(result.value.openOrder).toBe(4);
    }
  });

  it('moves a task from one list to another in the same organization', () => {
    const onGroceries: Task = { ...current, listId: groceries.id };

    const result = decideUpdateTask({
      current: onGroceries,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: weekend.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: weekend,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.type).toBe('TaskUpdated');
      if (result.value.type === 'TaskUpdated') {
        expect(result.value.listId).toBe('list-weekend');
        expect(result.value.openOrder).toBe(0);
      }
    }
  });

  it('is a noop when putting the task on the same list again', () => {
    const onGroceries: Task = { ...current, listId: groceries.id };

    const result = decideUpdateTask({
      current: onGroceries,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: groceries.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: groceries,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ type: 'Noop' });
    }
  });

  it('still updates other fields when the list is unchanged', () => {
    const onGroceries: Task = { ...current, listId: groceries.id };

    const result = decideUpdateTask({
      current: onGroceries,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        title: 'Buy oat milk',
        listId: groceries.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: groceries,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'TaskUpdated') {
      expect(result.value.title).toBe('Buy oat milk');
      expect(result.value.listId).toBeUndefined();
    }
  });

  it('rejects adding a completed task to a list', () => {
    const completed: Task = {
      ...current,
      completedAt: '2025-01-16T10:00:00.000Z',
    };

    const result = decideUpdateTask({
      current: completed,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: groceries.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: groceries,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TASK_NOT_OPEN');
    }
  });

  it('rejects moving a completed task to another list', () => {
    const completedOnGroceries: Task = {
      ...current,
      listId: groceries.id,
      completedAt: '2025-01-16T10:00:00.000Z',
    };

    const result = decideUpdateTask({
      current: completedOnGroceries,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: weekend.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: weekend,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TASK_NOT_OPEN');
    }
  });

  it('is a noop when a completed task is put on its current list again', () => {
    const completedOnGroceries: Task = {
      ...current,
      listId: groceries.id,
      completedAt: '2025-01-16T10:00:00.000Z',
    };

    const result = decideUpdateTask({
      current: completedOnGroceries,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: groceries.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: groceries,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ type: 'Noop' });
    }
  });

  it('rejects an unknown list', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: 'list-missing',
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_IN_ORGANIZATION');
    }
  });

  it('rejects a list from another organization', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: otherOrgList.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: otherOrgList,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_IN_ORGANIZATION');
    }
  });

  it('omits listId from the event when the command does not set a list', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        title: 'Buy oat milk',
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'TaskUpdated') {
      expect(result.value.listId).toBeUndefined();
      expect(result.value.title).toBe('Buy oat milk');
    }
  });

  it('takes an open task off a list', () => {
    const onGroceries: Task = { ...current, listId: groceries.id };

    const result = decideUpdateTask({
      current: onGroceries,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: null,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'TaskUpdated',
        id: 'task-123',
        organizationId: 'org-123',
        title: undefined,
        dueDate: undefined,
        assigneeId: undefined,
        listId: null,
        projectId: undefined,
        openOrder: 0,
        occurredAt: '2025-01-15T10:00:00.000Z',
      });
    }
  });

  it('appends take-off to the end of the unlisted open pile', () => {
    const onGroceries: Task = { ...current, listId: groceries.id, openOrder: 1 };

    const result = decideUpdateTask({
      current: onGroceries,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: null,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 5,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'TaskUpdated') {
      expect(result.value.listId).toBeNull();
      expect(result.value.openOrder).toBe(5);
    }
  });

  it('is a noop when taking an already-unlisted task off a list', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: null,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ type: 'Noop' });
    }
  });

  it('still updates other fields when taking off an already-unlisted task', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        title: 'Buy oat milk',
        listId: null,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'TaskUpdated') {
      expect(result.value.title).toBe('Buy oat milk');
      expect(result.value.listId).toBeUndefined();
    }
  });

  it('rejects taking a completed task off a list', () => {
    const completedOnGroceries: Task = {
      ...current,
      listId: groceries.id,
      completedAt: '2025-01-16T10:00:00.000Z',
    };

    const result = decideUpdateTask({
      current: completedOnGroceries,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: null,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TASK_NOT_OPEN');
    }
  });

  it('is a noop when a completed unlisted task is taken off again', () => {
    const completed: Task = {
      ...current,
      completedAt: '2025-01-16T10:00:00.000Z',
    };

    const result = decideUpdateTask({
      current: completed,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        listId: null,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ type: 'Noop' });
    }
  });

  it('rejects an assignee who is not in the organization', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        assigneeId: 'outsider',
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },

      },
      list: null,
      project: null,
      assigneeInOrganization: false,
      nextOpenOrder: 0,
    now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('ASSIGNEE_NOT_IN_ORGANIZATION');
    }
  });

  const garden = {
    id: 'project-garden',
    organizationId: 'org-123',
    status: 'active' as const,
  };
  const cabin = {
    id: 'project-cabin',
    organizationId: 'org-123',
    status: 'active' as const,
  };

  it('sets a project on an open task without touching list or order', () => {
    const onList: Task = { ...current, listId: groceries.id, openOrder: 3 };
    const result = decideUpdateTask({
      current: onList,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        projectId: garden.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      },
      list: null,
      project: garden,
      assigneeInOrganization: null,
      nextOpenOrder: 99,
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'TaskUpdated') {
      expect(result.value.projectId).toBe('project-garden');
      expect(result.value.listId).toBeUndefined();
      expect(result.value.openOrder).toBeUndefined();
    }
  });

  it('moves a task from one project to another', () => {
    const inGarden: Task = { ...current, projectId: garden.id };
    const result = decideUpdateTask({
      current: inGarden,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        projectId: cabin.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      },
      list: null,
      project: cabin,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'TaskUpdated') {
      expect(result.value.projectId).toBe('project-cabin');
    }
  });

  it('clears a project without touching list or order', () => {
    const inGarden: Task = { ...current, projectId: garden.id, listId: groceries.id, openOrder: 2 };
    const result = decideUpdateTask({
      current: inGarden,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        projectId: null,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      },
      list: null,
      project: null,
      assigneeInOrganization: null,
      nextOpenOrder: 7,
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'TaskUpdated') {
      expect(result.value.projectId).toBeNull();
      expect(result.value.listId).toBeUndefined();
      expect(result.value.openOrder).toBeUndefined();
    }
  });

  it('is a noop when putting the task in the same project again', () => {
    const inGarden: Task = { ...current, projectId: garden.id };
    const result = decideUpdateTask({
      current: inGarden,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        projectId: garden.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      },
      list: null,
      project: garden,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ type: 'Noop' });
    }
  });

  it('rejects a project from another organization', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        projectId: 'project-other',
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      },
      list: null,
      project: { id: 'project-other', organizationId: 'org-other', status: 'active' },
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_NOT_IN_ORGANIZATION');
    }
  });

  it('rejects adding a task to a done project', () => {
    const result = decideUpdateTask({
      current,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        projectId: garden.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      },
      list: null,
      project: { ...garden, status: 'done' },
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_DONE');
    }
  });

  it('rejects moving a finished task into a project', () => {
    const finished: Task = { ...current, completedAt: '2025-01-16T10:00:00.000Z' };
    const result = decideUpdateTask({
      current: finished,
      command: {
        id: current.id,
        organizationId: current.organizationId,
        projectId: garden.id,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      },
      list: null,
      project: garden,
      assigneeInOrganization: null,
      nextOpenOrder: 0,
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TASK_NOT_OPEN');
    }
  });
});
