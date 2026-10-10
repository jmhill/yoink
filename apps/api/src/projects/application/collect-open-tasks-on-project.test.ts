import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import { collectAllOpenTasksOnProject } from './collect-open-tasks-on-project.js';
import { projectTaskCursor } from '../../listing/domain/list-keys.js';

const task = (id: string, createdAt: string): Task => ({
  id,
  organizationId: 'org-123',
  createdById: 'user-456',
  title: id,
  projectId: 'project-garden',
  createdAt,
  lastChangedAt: createdAt,
  lastChangedBy: 'user-456',
  completedBy: null,
});

const first = task('task-1', '2025-01-15T10:00:02.000Z');
const second = task('task-2', '2025-01-15T10:00:01.000Z');
const third = task('task-3', '2025-01-15T10:00:00.000Z');

describe('collectAllOpenTasksOnProject', () => {
  it('pages until every open task is read', async () => {
    const pages = [
      { rows: [first], total: 3 },
      { rows: [second], total: 3 },
      { rows: [third], total: 3 },
    ];
    let calls = 0;

    const result = await collectAllOpenTasksOnProject({
      page: ({ seek, fetchLimit }) => {
        expect(fetchLimit).toBe(1);
        const index = calls;
        calls += 1;
        if (index === 0) {
          expect(seek).toBeUndefined();
        } else {
          const previous = pages[index - 1]?.rows[0];
          expect(previous).toBeDefined();
          if (previous) {
            expect(seek).toEqual(projectTaskCursor.of(previous));
          }
        }
        const page = pages[index];
        if (!page) {
          throw new Error('unexpected extra page');
        }
        return okAsync(page);
      },
      organizationId: 'org-123',
      projectId: 'project-garden',
      fetchLimit: 1,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.map((item) => item.id)).toEqual(['task-1', 'task-2', 'task-3']);
    }
    expect(calls).toBe(3);
  });

  it('refuses when a short page still leaves unread open tasks', async () => {
    const result = await collectAllOpenTasksOnProject({
      page: () => okAsync({ rows: [first], total: 3 }),
      organizationId: 'org-123',
      projectId: 'project-garden',
      fetchLimit: 1000,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.type === 'OPEN_TASKS_UNREAD') {
      expect(result.error.openTaskCount).toBe(3);
      expect(result.error.readCount).toBe(1);
    }
  });
});
