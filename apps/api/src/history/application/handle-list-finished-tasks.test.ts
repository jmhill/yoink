import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import { UNKNOWN_ACTOR_NAME } from '../../shared/change-log/domain/to-timeline-entry.js';
import { handleListFinishedTasksOnProject } from './handle-list-finished-tasks.js';

const now = '2026-10-11T15:00:00.000Z';

const project: Project = {
  id: 'project-1',
  organizationId: 'org-1',
  createdById: 'user-alice',
  name: 'Kitchen',
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdAt: now,
  lastChangedAt: now,
  lastChangedBy: 'user-alice',
};

const finishedTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  organizationId: 'org-1',
  createdById: 'user-alice',
  title: 'Paint samples',
  createdAt: now,
  completedAt: now,
  completedBy: 'user-alice',
  lastChangedAt: now,
  lastChangedBy: 'user-alice',
  projectId: 'project-1',
  ...overrides,
});

describe('handleListFinishedTasksOnProject', () => {
  it('resolves finished-by names from the users lookup', async () => {
    const result = await handleListFinishedTasksOnProject(
      { projectId: 'project-1', organizationId: 'org-1' },
      {
        load: () => okAsync(project),
        pageFinishedTasksInProject: () =>
          okAsync({ rows: [finishedTask()], total: 1 }),
        loadLookups: () =>
          okAsync({
            subjectOf: () => ({ title: null, deleted: false }),
            taskTitleOf: () => null,
            actorNameOf: (userId) => (userId === 'user-alice' ? 'Alice' : UNKNOWN_ACTOR_NAME),
          }),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items[0]?.completedByName).toBe('Alice');
    }
  });

  it('returns STORAGE_ERROR when a finished row has no completion date', async () => {
    const result = await handleListFinishedTasksOnProject(
      { projectId: 'project-1', organizationId: 'org-1' },
      {
        load: () => okAsync(project),
        pageFinishedTasksInProject: () =>
          okAsync({
            rows: [finishedTask({ completedAt: undefined })],
            total: 1,
          }),
        loadLookups: () => errAsync({ type: 'STORAGE_ERROR', message: 'unused' }),
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
