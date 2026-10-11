import { describe, it, expect } from 'vitest';
import type { Project, Task } from '@yoink/api-contracts';
import { decideSetNextAction } from './decide-set-next-action.js';
import type { SetProjectNextActionCommand } from './project-commands.js';

const garden: Project = {
  id: 'project-garden',
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

const soil: Task = {
  id: 'task-soil',
  organizationId: garden.organizationId,
  createdById: garden.createdById,
  title: 'Buy soil',
  projectId: garden.id,
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: '2025-01-15T10:00:00.000Z',
  lastChangedBy: garden.createdById,
  completedBy: null,
};

const herbs: Task = {
  ...soil,
  id: 'task-herbs',
  title: 'Plant herbs',
};

const now = '2026-10-10T18:00:00.000Z';

const command = (
  taskId: string | null,
  actor: SetProjectNextActionCommand['actor'] = {
    kind: 'user',
    userId: 'user-456',
    via: 'session',
  }
): SetProjectNextActionCommand => ({
  id: garden.id,
  organizationId: garden.organizationId,
  taskId,
  actor,
});

describe('decideSetNextAction', () => {
  it('sets an open task in the project', () => {
    const result = decideSetNextAction({
      project: garden,
      task: soil,
      command: command(soil.id),
      now,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'set',
        event: {
          type: 'ProjectNextActionSet',
          id: garden.id,
          organizationId: garden.organizationId,
          taskId: soil.id,
          previousTaskId: null,
          occurredAt: now,
        },
      });
    }
  });

  it('replaces with one Set record and previousTaskId', () => {
    const result = decideSetNextAction({
      project: { ...garden, nextActionTaskId: soil.id },
      task: herbs,
      command: command(herbs.id),
      now,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'set') {
      expect(result.value.event.taskId).toBe(herbs.id);
      expect(result.value.event.previousTaskId).toBe(soil.id);
    }
  });

  it('is a no-op when the same task is already the next action', () => {
    const result = decideSetNextAction({
      project: { ...garden, nextActionTaskId: soil.id },
      task: soil,
      command: command(soil.id),
      now,
    });
    expect(result._unsafeUnwrap()).toEqual({ type: 'unchanged' });
  });

  it('clears the current next action', () => {
    const result = decideSetNextAction({
      project: { ...garden, nextActionTaskId: soil.id },
      task: null,
      command: command(null),
      now,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'cleared') {
      expect(result.value.event).toEqual({
        type: 'ProjectNextActionCleared',
        id: garden.id,
        organizationId: garden.organizationId,
        taskId: soil.id,
        reason: 'cleared',
        occurredAt: now,
      });
    }
  });

  it('is a no-op when clearing and there is none', () => {
    const result = decideSetNextAction({
      project: garden,
      task: null,
      command: command(null),
      now,
    });
    expect(result._unsafeUnwrap()).toEqual({ type: 'unchanged' });
  });

  it('refuses a finished task', () => {
    const result = decideSetNextAction({
      project: garden,
      task: { ...soil, completedAt: now, completedBy: garden.createdById },
      command: command(soil.id),
      now,
    });
    expect(result._unsafeUnwrapErr().type).toBe('TASK_NOT_OPEN');
  });

  it('refuses a task that is not in the project', () => {
    const result = decideSetNextAction({
      project: garden,
      task: { ...soil, projectId: 'project-other' },
      command: command(soil.id),
      now,
    });
    expect(result._unsafeUnwrapErr().type).toBe('TASK_NOT_IN_PROJECT');
  });

  it('refuses a done project', () => {
    const result = decideSetNextAction({
      project: { ...garden, status: 'done' },
      task: soil,
      command: command(soil.id),
      now,
    });
    expect(result._unsafeUnwrapErr().type).toBe('PROJECT_DONE');
  });

  it('treats a missing or other-org task as not found', () => {
    expect(
      decideSetNextAction({
        project: garden,
        task: null,
        command: command(soil.id),
        now,
      })._unsafeUnwrapErr().type
    ).toBe('TASK_NOT_FOUND');
    expect(
      decideSetNextAction({
        project: garden,
        task: { ...soil, organizationId: 'org-other' },
        command: command(soil.id),
        now,
      })._unsafeUnwrapErr().type
    ).toBe('TASK_NOT_FOUND');
  });

  it('lets a bot set and clear', () => {
    const bot = {
      kind: 'bot' as const,
      userId: 'user-lane',
      tokenId: 'tok-lane',
      name: 'Lane',
      via: 'token' as const,
    };
    const set = decideSetNextAction({
      project: garden,
      task: soil,
      command: command(soil.id, bot),
      now,
    });
    expect(set.isOk()).toBe(true);
    const cleared = decideSetNextAction({
      project: { ...garden, nextActionTaskId: soil.id },
      task: null,
      command: command(null, bot),
      now,
    });
    expect(cleared.isOk()).toBe(true);
    if (cleared.isOk() && cleared.value.type === 'cleared') {
      expect(cleared.value.event.reason).toBe('cleared');
    }
  });
});
