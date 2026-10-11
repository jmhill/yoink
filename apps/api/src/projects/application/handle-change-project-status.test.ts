import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import { handleChangeProjectStatus } from './handle-change-project-status.js';
import type { PersistProjectStatusChange } from './ports.js';

const garden: Project = {
  id: 'project-garden',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'Garden',
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: '2025-01-15T10:00:00.000Z',
  lastChangedBy: 'user-456',
};

const task = (id: string): Task => ({
  id,
  organizationId: garden.organizationId,
  createdById: garden.createdById,
  title: id,
  projectId: garden.id,
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: '2025-01-15T10:00:00.000Z',
  lastChangedBy: garden.createdById,
  completedBy: null,
});

const persistStatus: PersistProjectStatusChange = () => okAsync(undefined);

const nextId = () => {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
};

describe('handleChangeProjectStatus', () => {
  it('counts completed tasks from the plans that were built', async () => {
    const soil = task('task-soil');
    const alreadyDone = {
      ...task('task-done'),
      completedAt: '2025-01-15T11:00:00.000Z',
      completedBy: garden.createdById,
    };

    const result = await handleChangeProjectStatus(
      {
        id: garden.id,
        organizationId: garden.organizationId,
        status: 'done',
        openTasks: 'complete',
        actor: { kind: 'user', userId: garden.createdById, via: 'session' },
      },
      {
        load: () => okAsync(garden),
        pageOpenTasksOnProject: () => okAsync({ rows: [alreadyDone, soil], total: 2 }),
        persistStatus,
        nextId: nextId(),
        now: () => '2026-10-10T15:00:00.000Z',
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.completedTaskCount).toBe(1);
      expect(result.value.removedTaskCount).toBe(0);
      expect(result.value.eventKinds.filter((kind) => kind === 'TaskCompleted')).toEqual([
        'TaskCompleted',
      ]);
    }
  });

  it('pages every open task before completing them', async () => {
    const first = task('task-1');
    const second = task('task-2');
    let calls = 0;

    const result = await handleChangeProjectStatus(
      {
        id: garden.id,
        organizationId: garden.organizationId,
        status: 'done',
        openTasks: 'complete',
        actor: { kind: 'user', userId: garden.createdById, via: 'session' },
      },
      {
        load: () => okAsync(garden),
        pageOpenTasksOnProject: ({ seek }) => {
          calls += 1;
          if (!seek) {
            return okAsync({ rows: [first], total: 2 });
          }
          return okAsync({ rows: [second], total: 2 });
        },
        persistStatus,
        nextId: nextId(),
        now: () => '2026-10-10T15:00:00.000Z',
        openTasksFetchLimit: 1,
      }
    );

    expect(calls).toBe(2);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.completedTaskCount).toBe(2);
    }
  });

  it('refuses when unread open tasks would be left behind', async () => {
    const result = await handleChangeProjectStatus(
      {
        id: garden.id,
        organizationId: garden.organizationId,
        status: 'done',
        openTasks: 'complete',
        actor: { kind: 'user', userId: garden.createdById, via: 'session' },
      },
      {
        load: () => okAsync(garden),
        pageOpenTasksOnProject: () => okAsync({ rows: [task('task-1')], total: 3 }),
        persistStatus,
        nextId: nextId(),
        now: () => '2026-10-10T15:00:00.000Z',
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.type === 'OPEN_TASKS_UNREAD') {
      expect(result.error.openTaskCount).toBe(3);
      expect(result.error.readCount).toBe(1);
    }
  });

  it('clears the next action when the project is marked done', async () => {
    const soil = task('task-soil');
    const withNext: Project = { ...garden, nextActionTaskId: soil.id };
    const result = await handleChangeProjectStatus(
      {
        id: garden.id,
        organizationId: garden.organizationId,
        status: 'done',
        openTasks: 'complete',
        actor: { kind: 'user', userId: garden.createdById, via: 'session' },
      },
      {
        load: () => okAsync(withNext),
        pageOpenTasksOnProject: () => okAsync({ rows: [soil], total: 1 }),
        persistStatus,
        nextId: nextId(),
        now: () => '2026-10-10T15:00:00.000Z',
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.view.nextActionTaskId).toBeNull();
      expect(result.value.eventKinds).toContain('ProjectNextActionCleared');
    }
  });
});
