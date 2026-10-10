import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { planOpenTasksForProjectDone } from './plan-open-tasks-for-done.js';
import type { ChangeProjectStatusCommand } from './project-commands.js';

const soil: Task = {
  id: 'task-soil',
  organizationId: 'org-123',
  createdById: 'user-456',
  title: 'Buy soil',
  projectId: 'project-garden',
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: '2025-01-15T10:00:00.000Z',
  lastChangedBy: 'user-456',
  completedBy: null,
};

const herbs: Task = {
  ...soil,
  id: 'task-herbs',
  title: 'Plant herbs',
};

const finished: Task = {
  ...soil,
  id: 'task-finished',
  title: 'Already done',
  completedAt: '2025-01-15T11:00:00.000Z',
  completedBy: 'user-456',
};

const command: ChangeProjectStatusCommand = {
  id: 'project-garden',
  organizationId: 'org-123',
  status: 'done',
  openTasks: 'complete',
  actor: { kind: 'user', userId: 'user-456', via: 'session' },
};

const nextId = () => {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
};

describe('planOpenTasksForProjectDone', () => {
  it('plans a complete for each open task', () => {
    const result = planOpenTasksForProjectDone({
      choice: 'complete',
      tasks: [soil, herbs],
      command,
      now: '2026-10-10T15:00:00.000Z',
      nextId: nextId(),
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(2);
      expect(
        result.value.every((plan) => plan.records.some((record) => record.kind === 'TaskCompleted'))
      ).toBe(true);
    }
  });

  it('plans a remove for each open task', () => {
    const result = planOpenTasksForProjectDone({
      choice: 'remove',
      tasks: [soil],
      command: { ...command, openTasks: 'remove' },
      now: '2026-10-10T15:00:00.000Z',
      nextId: nextId(),
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.records.some((record) => record.kind === 'TaskRemovedFromProject')).toBe(
        true
      );
    }
  });

  it('skips a no-op complete and does not count it', () => {
    const result = planOpenTasksForProjectDone({
      choice: 'complete',
      tasks: [finished, soil],
      command,
      now: '2026-10-10T15:00:00.000Z',
      nextId: nextId(),
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      const plan = result.value[0];
      expect(plan?.action).toBe('update');
      if (plan && plan.action !== 'delete') {
        expect(plan.view.id).toBe(soil.id);
      }
    }
  });

  it('returns a typed plan error instead of STORAGE_ERROR when remove is refused', () => {
    const result = planOpenTasksForProjectDone({
      choice: 'remove',
      tasks: [finished],
      command: { ...command, openTasks: 'remove' },
      now: '2026-10-10T15:00:00.000Z',
      nextId: nextId(),
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('OPEN_TASK_PLAN_FAILED');
      expect(result.error.taskId).toBe(finished.id);
    }
  });

  it('returns no plans when there is no choice', () => {
    const result = planOpenTasksForProjectDone({
      choice: undefined,
      tasks: [soil],
      command: { ...command, openTasks: undefined },
      now: '2026-10-10T15:00:00.000Z',
      nextId: nextId(),
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });
});
