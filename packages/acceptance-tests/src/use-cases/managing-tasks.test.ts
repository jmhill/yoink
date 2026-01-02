import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor } from '@yoink/acceptance-testing';
import { NotFoundError, ValidationError } from '@yoink/acceptance-testing';

// HTTP-only tests for now (Playwright will be enabled when UI is built)
usingDrivers(['http'] as const, (ctx) => {
  describe(`Managing tasks [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
    });

    describe('creating tasks', () => {
      it('can create a task directly', async () => {
        const task = await alice.createTask({ title: 'Buy groceries' });

        expect(task.title).toBe('Buy groceries');
        expect(task.id).toBeDefined();
        expect(task.createdAt).toBeDefined();
      });

      it('can create a task with a due date', async () => {
        const task = await alice.createTask({
          title: 'Submit report',
          dueDate: '2024-12-31',
        });

        expect(task.dueDate).toBe('2024-12-31');
      });

      it('rejects task with empty title', async () => {
        await expect(alice.createTask({ title: '' })).rejects.toThrow(ValidationError);
      });
    });

    describe('listing tasks', () => {
      it('can list all tasks', async () => {
        await alice.createTask({ title: 'Task 1' });
        await alice.createTask({ title: 'Task 2' });

        const tasks = await alice.listTasks('all');

        expect(tasks.length).toBeGreaterThanOrEqual(2);
        expect(tasks.some((t) => t.title === 'Task 1')).toBe(true);
        expect(tasks.some((t) => t.title === 'Task 2')).toBe(true);
      });

      it('filters tasks by today', async () => {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

        await alice.createTask({ title: 'Due today', dueDate: today });
        await alice.createTask({ title: 'Due tomorrow', dueDate: tomorrow });

        const todayTasks = await alice.listTasks('today');

        expect(todayTasks.some((t) => t.title === 'Due today')).toBe(true);
        expect(todayTasks.some((t) => t.title === 'Due tomorrow')).toBe(false);
      });

      it('includes overdue tasks in today filter', async () => {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        await alice.createTask({ title: 'Overdue task', dueDate: yesterday });
        await alice.createTask({ title: 'Due today', dueDate: today });

        const todayTasks = await alice.listTasks('today');

        expect(todayTasks.some((t) => t.title === 'Overdue task')).toBe(true);
        expect(todayTasks.some((t) => t.title === 'Due today')).toBe(true);
      });

      it('excludes overdue tasks from upcoming filter', async () => {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

        await alice.createTask({ title: 'Overdue task', dueDate: yesterday });
        await alice.createTask({ title: 'Due tomorrow', dueDate: tomorrow });

        const upcomingTasks = await alice.listTasks('upcoming');

        expect(upcomingTasks.some((t) => t.title === 'Overdue task')).toBe(false);
        expect(upcomingTasks.some((t) => t.title === 'Due tomorrow')).toBe(true);
      });

      it('filters tasks by upcoming', async () => {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

        await alice.createTask({ title: 'Due today', dueDate: today });
        await alice.createTask({ title: 'Due tomorrow', dueDate: tomorrow });

        const upcomingTasks = await alice.listTasks('upcoming');

        expect(upcomingTasks.some((t) => t.title === 'Due today')).toBe(false);
        expect(upcomingTasks.some((t) => t.title === 'Due tomorrow')).toBe(true);
      });
    });

    describe('completing tasks', () => {
      it('can complete a task', async () => {
        const task = await alice.createTask({ title: 'Complete me' });

        const completed = await alice.completeTask(task.id);

        expect(completed.completedAt).toBeDefined();
      });

      it('can uncomplete a task', async () => {
        const task = await alice.createTask({ title: 'Toggle me' });
        await alice.completeTask(task.id);

        const uncompleted = await alice.uncompleteTask(task.id);

        expect(uncompleted.completedAt).toBeUndefined();
      });

      it('filters completed tasks', async () => {
        const task1 = await alice.createTask({ title: 'Will complete' });
        await alice.createTask({ title: 'Will not complete' });
        await alice.completeTask(task1.id);

        const completedTasks = await alice.listTasks('completed');

        expect(completedTasks.some((t) => t.title === 'Will complete')).toBe(true);
        expect(completedTasks.some((t) => t.title === 'Will not complete')).toBe(false);
      });
    });

    describe('pinning tasks', () => {
      it('can pin a task', async () => {
        const task = await alice.createTask({ title: 'Pin me' });

        const pinned = await alice.pinTask(task.id);

        expect(pinned.pinnedAt).toBeDefined();
      });

      it('can unpin a task', async () => {
        const task = await alice.createTask({ title: 'Unpin me' });
        await alice.pinTask(task.id);

        const unpinned = await alice.unpinTask(task.id);

        expect(unpinned.pinnedAt).toBeUndefined();
      });

      it('pinned tasks appear first in list', async () => {
        const task1 = await alice.createTask({ title: 'First created' });
        const task2 = await alice.createTask({ title: 'Second created' });
        await alice.pinTask(task1.id);

        const tasks = await alice.listTasks('all');

        // Find positions
        const pinnedIndex = tasks.findIndex((t) => t.id === task1.id);
        const unpinnedIndex = tasks.findIndex((t) => t.id === task2.id);

        expect(pinnedIndex).toBeLessThan(unpinnedIndex);
      });
    });

    describe('updating tasks', () => {
      it('can update task title', async () => {
        const task = await alice.createTask({ title: 'Original' });

        const updated = await alice.updateTask(task.id, { title: 'Updated' });

        expect(updated.title).toBe('Updated');
      });

      it('can update task due date', async () => {
        const task = await alice.createTask({ title: 'No date yet' });

        const updated = await alice.updateTask(task.id, { dueDate: '2024-12-25' });

        expect(updated.dueDate).toBe('2024-12-25');
      });

      it('can clear task due date', async () => {
        const task = await alice.createTask({ title: 'Has date', dueDate: '2024-12-25' });

        const updated = await alice.updateTask(task.id, { dueDate: null });

        expect(updated.dueDate).toBeUndefined();
      });
    });

    describe('deleting tasks', () => {
      it('can delete a task', async () => {
        const task = await alice.createTask({ title: 'Delete me' });

        await alice.deleteTask(task.id);

        await expect(alice.getTask(task.id)).rejects.toThrow(NotFoundError);
      });
    });

    describe('error handling', () => {
      it('returns not found for non-existent task', async () => {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';

        await expect(alice.getTask(nonExistentId)).rejects.toThrow(NotFoundError);
      });

      it('returns not found when completing non-existent task', async () => {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';

        await expect(alice.completeTask(nonExistentId)).rejects.toThrow(NotFoundError);
      });

      it('returns not found when deleting non-existent task', async () => {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';

        await expect(alice.deleteTask(nonExistentId)).rejects.toThrow(NotFoundError);
      });

      it('rejects invalid id format', async () => {
        await expect(alice.getTask('not-a-uuid')).rejects.toThrow(ValidationError);
      });
    });
  });
});
