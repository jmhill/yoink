import { describe, it, expect } from 'vitest';
import { errAsync } from 'neverthrow';
import { createFakeProjectStore } from './fake-project-store.js';
import { createStoreBackedProjectStatusPersist } from './store-backed-persist.js';
import { createFakeTaskStore } from '../../tasks/infrastructure/fake-task-store.js';
import { createFakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import { planProjectChange } from '../domain/plan-project-change.js';
import { planTaskChange } from '../../tasks/domain/plan-task-change.js';
import type { Project, Task } from '@yoink/api-contracts';

const now = '2025-01-15T10:00:00.000Z';
const later = '2025-01-15T11:00:00.000Z';

const garden: Project = {
  id: 'project-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  name: 'Garden',
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: 'task-1',
  notebookPages: [],
  createdAt: now,
  lastChangedAt: now,
  lastChangedBy: 'user-1',
};

const soil: Task = {
  id: 'task-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  title: 'Buy soil',
  projectId: 'project-1',
  createdAt: now,
  lastChangedAt: now,
  lastChangedBy: 'user-1',
  completedBy: null,
};

describe('store-backed project persist', () => {
  it('rolls back the task and project when a change-log insert fails', async () => {
    const projects = createFakeProjectStore([garden]);
    const tasks = createFakeTaskStore({ initialTasks: [soil] });
    const changeLog = createFakeChangeLogStore();
    const originalInsert = changeLog.insert;
    let inserts = 0;
    changeLog.insert = (record) => {
      inserts += 1;
      if (inserts > 1) {
        return errAsync({ type: 'STORAGE_ERROR', message: 'history failed' });
      }
      return originalInsert(record);
    };

    const persist = createStoreBackedProjectStatusPersist({
      projects,
      tasks,
      changeLog,
    });

    const actor = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };
    const result = await persist({
      project: planProjectChange({
        event: {
          type: 'ProjectNextActionCleared',
          id: garden.id,
          organizationId: garden.organizationId,
          taskId: soil.id,
          reason: 'completed',
          occurredAt: later,
        },
        current: garden,
        actor,
        ids: { recordId: 'log-clear' },
      }),
      tasks: [
        planTaskChange({
          event: {
            type: 'TaskCompleted',
            id: soil.id,
            organizationId: soil.organizationId,
            completedAt: later,
            occurredAt: later,
          },
          current: soil,
          actor,
          ids: { recordId: 'log-complete' },
        }),
      ],
    });

    expect(result.isErr()).toBe(true);
    expect((await projects.findById(garden.id))._unsafeUnwrap()?.nextActionTaskId).toBe(
      'task-1'
    );
    expect((await tasks.findById(soil.id))._unsafeUnwrap()?.completedAt).toBeUndefined();
  });

  it('rolls back New task create plus set when a change-log insert fails', async () => {
    const emptyGarden: Project = { ...garden, nextActionTaskId: null };
    const projects = createFakeProjectStore([emptyGarden]);
    const tasks = createFakeTaskStore({ initialTasks: [] });
    const changeLog = createFakeChangeLogStore();
    const originalInsert = changeLog.insert;
    let inserts = 0;
    changeLog.insert = (record) => {
      inserts += 1;
      if (inserts > 1) {
        return errAsync({ type: 'STORAGE_ERROR', message: 'history failed' });
      }
      return originalInsert(record);
    };

    const persist = createStoreBackedProjectStatusPersist({
      projects,
      tasks,
      changeLog,
    });
    const actor = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };
    const created: Task = {
      ...soil,
      id: 'task-new',
      title: 'Order lumber',
    };

    const result = await persist({
      project: planProjectChange({
        event: {
          type: 'ProjectNextActionSet',
          id: emptyGarden.id,
          organizationId: emptyGarden.organizationId,
          taskId: created.id,
          previousTaskId: null,
          occurredAt: later,
        },
        current: emptyGarden,
        actor,
        ids: { recordId: 'log-set' },
      }),
      tasks: [
        planTaskChange({
          event: {
            type: 'TaskCreated',
            id: created.id,
            organizationId: created.organizationId,
            createdById: created.createdById,
            title: created.title,
            projectId: emptyGarden.id,
            openOrder: 0,
            createdAt: later,
            occurredAt: later,
          },
          current: null,
          actor,
          ids: { recordId: 'log-create' },
        }),
      ],
    });

    expect(result.isErr()).toBe(true);
    expect((await projects.findById(emptyGarden.id))._unsafeUnwrap()?.nextActionTaskId).toBeNull();
    expect((await tasks.findById(created.id))._unsafeUnwrap()).toBeNull();
  });

  it('does not write a clear record or bump last-changed when the guarded clear matches 0 rows', async () => {
    const projects = createFakeProjectStore([garden]);
    const tasks = createFakeTaskStore({ initialTasks: [soil] });
    const changeLog = createFakeChangeLogStore();
    const persist = createStoreBackedProjectStatusPersist({
      projects,
      tasks,
      changeLog,
    });
    const actor = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };

    const result = await persist({
      project: planProjectChange({
        event: {
          type: 'ProjectNextActionCleared',
          id: garden.id,
          organizationId: garden.organizationId,
          taskId: 'task-other',
          reason: 'completed',
          occurredAt: later,
        },
        current: { ...garden, nextActionTaskId: 'task-other' },
        actor,
        ids: { recordId: 'log-stale-clear' },
      }),
      tasks: [],
    });

    expect(result.isOk()).toBe(true);
    const after = (await projects.findById(garden.id))._unsafeUnwrap();
    expect(after?.nextActionTaskId).toBe('task-1');
    expect(after?.lastChangedAt).toBe(garden.lastChangedAt);
    expect(after?.lastChangedBy).toBe(garden.lastChangedBy);
    expect(changeLog.records.map((record) => record.kind)).toEqual([]);
  });

  it('refuses a set and writes no history when the project is marked done between load and save', async () => {
    const done: Project = { ...garden, status: 'done', nextActionTaskId: null };
    const projects = createFakeProjectStore([done]);
    const tasks = createFakeTaskStore({ initialTasks: [soil] });
    const changeLog = createFakeChangeLogStore();
    const persist = createStoreBackedProjectStatusPersist({
      projects,
      tasks,
      changeLog,
    });
    const actor = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };
    const staleActive: Project = { ...garden, status: 'active', nextActionTaskId: null };

    const result = await persist({
      project: planProjectChange({
        event: {
          type: 'ProjectNextActionSet',
          id: staleActive.id,
          organizationId: staleActive.organizationId,
          taskId: soil.id,
          previousTaskId: null,
          occurredAt: later,
        },
        current: staleActive,
        actor,
        ids: { recordId: 'log-raced-set' },
      }),
      tasks: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_DONE');
    }
    const after = (await projects.findById(garden.id))._unsafeUnwrap();
    expect(after?.status).toBe('done');
    expect(after?.nextActionTaskId).toBeNull();
    expect(after?.lastChangedAt).toBe(done.lastChangedAt);
    expect(changeLog.records.map((record) => record.kind)).toEqual([]);
  });
});
