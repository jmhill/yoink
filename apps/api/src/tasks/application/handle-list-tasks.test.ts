import { describe, it, expect } from 'vitest';
import { handleListTasks } from './handle-list-tasks.js';
import { createFakeTaskStore } from '../infrastructure/fake-task-store.js';
import { completedTaskCursor } from '../../listing/domain/list-keys.js';
import { encodeKeysetCursor } from '../../listing/infrastructure/keyset-codec.js';

const today = () => '2025-01-15';

describe('handleListTasks', () => {
  it('returns tasks from the store as a listed page', async () => {
    const store = createFakeTaskStore({
      initialTasks: [
        {
          id: 'task-id-1',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Test task',
          createdAt: '2025-01-15T10:00:00.000Z',
        },
      ],
    });

    const result = await handleListTasks(
      { organizationId: 'org-123' },
      { list: (options) => store.findByOrganization(options), today }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0]?.title).toBe('Test task');
      expect(result.value.hasMore).toBe(false);
      expect(result.value.nextCursor).toBeNull();
      expect(result.value.total).toBe(1);
    }
  });

  it('filters by today including overdue', async () => {
    const store = createFakeTaskStore({
      initialTasks: [
        {
          id: 'overdue-task',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Overdue task',
          dueDate: '2025-01-14',
          createdAt: '2025-01-14T10:00:00.000Z',
        },
        {
          id: 'today-task',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Today task',
          dueDate: '2025-01-15',
          createdAt: '2025-01-15T10:00:00.000Z',
        },
        {
          id: 'tomorrow-task',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Tomorrow task',
          dueDate: '2025-01-16',
          createdAt: '2025-01-15T10:00:00.000Z',
        },
      ],
    });

    const result = await handleListTasks(
      { organizationId: 'org-123', filter: 'today' },
      { list: (options) => store.findByOrganization(options), today }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items.map((task) => task.title).sort()).toEqual([
        'Overdue task',
        'Today task',
      ]);
    }
  });

  it('filters by upcoming', async () => {
    const store = createFakeTaskStore({
      initialTasks: [
        {
          id: 'today-task',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Today task',
          dueDate: '2025-01-15',
          createdAt: '2025-01-15T10:00:00.000Z',
        },
        {
          id: 'tomorrow-task',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Tomorrow task',
          dueDate: '2025-01-16',
          createdAt: '2025-01-15T10:00:00.000Z',
        },
      ],
    });

    const result = await handleListTasks(
      { organizationId: 'org-123', filter: 'upcoming' },
      { list: (options) => store.findByOrganization(options), today }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0]?.title).toBe('Tomorrow task');
    }
  });

  it('filters by completed', async () => {
    const completedTask = {
      id: 'completed-task',
      organizationId: 'org-123',
      createdById: 'user-456',
      title: 'Completed task',
      completedAt: '2025-01-15T11:00:00.000Z',
      createdAt: '2025-01-15T10:00:00.000Z',
    };
    const store = createFakeTaskStore({
      initialTasks: [
        {
          id: 'incomplete-task',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Incomplete task',
          createdAt: '2025-01-15T10:00:00.000Z',
        },
        completedTask,
      ],
    });

    const result = await handleListTasks(
      { organizationId: 'org-123', filter: 'completed' },
      { list: (options) => store.findByOrganization(options), today }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0]?.title).toBe('Completed task');
    }
  });

  it('filters by mine — only incomplete tasks assigned to the caller', async () => {
    const store = createFakeTaskStore({
      initialTasks: [
        {
          id: 'mine-task',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'UAT checkout',
          createdAt: '2025-01-15T10:00:00.000Z',
          assigneeId: 'user-456',
        },
        {
          id: 'theirs-task',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Buy milk',
          createdAt: '2025-01-15T10:00:00.000Z',
          assigneeId: 'agent-789',
        },
        {
          id: 'unassigned-task',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Unowned chore',
          createdAt: '2025-01-15T10:00:00.000Z',
        },
        {
          id: 'completed-mine',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Done UAT',
          createdAt: '2025-01-15T10:00:00.000Z',
          completedAt: '2025-01-15T11:00:00.000Z',
          assigneeId: 'user-456',
        },
      ],
    });

    const result = await handleListTasks(
      { organizationId: 'org-123', filter: 'mine', callerId: 'user-456' },
      { list: (options) => store.findByOrganization(options), today }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0]?.title).toBe('UAT checkout');
    }
  });

  it('returns remaining completed tasks after the cursor item is uncompleted', async () => {
    const first = {
      id: 'done-1',
      organizationId: 'org-123',
      createdById: 'user-456',
      title: 'First done',
      completedAt: '2025-01-15T12:00:00.000Z',
      createdAt: '2025-01-15T10:00:00.000Z',
    };
    const second = {
      id: 'done-2',
      organizationId: 'org-123',
      createdById: 'user-456',
      title: 'Second done',
      completedAt: '2025-01-15T11:00:00.000Z',
      createdAt: '2025-01-15T10:00:00.000Z',
    };
    const third = {
      id: 'done-3',
      organizationId: 'org-123',
      createdById: 'user-456',
      title: 'Third done',
      completedAt: '2025-01-15T10:00:00.000Z',
      createdAt: '2025-01-15T10:00:00.000Z',
    };
    const store = createFakeTaskStore({ initialTasks: [first, second, third] });
    const deps = { list: store.findByOrganization, today };

    const page1 = await handleListTasks(
      { organizationId: 'org-123', filter: 'completed', limit: 1 },
      deps
    );
    expect(page1.isOk()).toBe(true);
    if (!page1.isOk()) return;
    expect(page1.value.items[0]?.id).toBe('done-1');
    const cursor = page1.value.nextCursor;
    expect(cursor).toBe(encodeKeysetCursor(completedTaskCursor(first)));

    await store.update({ ...first, completedAt: undefined });

    const page2 = await handleListTasks(
      { organizationId: 'org-123', filter: 'completed', limit: 10, cursor: cursor ?? undefined },
      deps
    );
    expect(page2.isOk()).toBe(true);
    if (!page2.isOk()) return;
    expect(page2.value.items.map((task) => task.id)).toEqual(['done-2', 'done-3']);
    expect(page2.value.hasMore).toBe(false);
    expect(page2.value.total).toBe(2);
  });

  it('returns InvalidCursor for a malformed cursor', async () => {
    const store = createFakeTaskStore();
    const result = await handleListTasks(
      { organizationId: 'org-123', cursor: 'not-a-cursor' },
      { list: (options) => store.findByOrganization(options), today }
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_CURSOR');
    }
  });

  it('returns error when store fails', async () => {
    const store = createFakeTaskStore({ shouldFailOnFind: true });
    const result = await handleListTasks(
      { organizationId: 'org-123' },
      { list: (options) => store.findByOrganization(options), today }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
