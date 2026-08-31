import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor, BrowserActor, AnonymousActor } from '@yoink/acceptance-testing';
import { UnauthorizedError, ValidationError } from '@yoink/acceptance-testing';

/**
 * Story 3: Add an existing task to a list.
 *
 * A list is an optional single bucket. This story puts an existing open task
 * onto a named list. Putting A onto B is a move. Same list again is a no-op.
 * Completed tasks cannot be added (or moved). Take-off is a later story.
 */
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Adding an existing task to a list [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-task-list@example.com');
      anonymous = ctx.createAnonymousActor();
    });

    it('puts an existing unlisted task on a named list', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk' });
      expect(task.listId).toBeUndefined();

      const updated = await alice.updateTask(task.id, { listId: list.id });

      expect(updated.listId).toBe(list.id);
    });

    it('moves a task from one list to another rather than tagging both', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const weekend = await alice.createNamedList('Weekend');
      const task = await alice.createTask({ title: 'Buy milk' });

      await alice.updateTask(task.id, { listId: groceries.id });
      const updated = await alice.updateTask(task.id, { listId: weekend.id });

      expect(updated.listId).toBe(weekend.id);
    });

    it('is a no-op when putting the task on the same list again', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk' });

      await alice.updateTask(task.id, { listId: list.id });
      const again = await alice.updateTask(task.id, { listId: list.id });

      expect(again.listId).toBe(list.id);
    });

    it('requires authentication to put a task on a list', async () => {
      await expect(
        anonymous.updateTask('550e8400-e29b-41d4-a716-446655440000', {
          listId: '550e8400-e29b-41d4-a716-446655440001',
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Adding an existing task to a list — API [${ctx.driverName}]`, () => {
    it('lets an agent token put a task on a list in the same organization', async () => {
      const alice = await ctx.createActor('alice-task-list-agent@example.com');
      const list = await alice.createNamedList('Shared board');
      const task = await alice.createTask({ title: 'Bot chore' });

      const minted = await alice.mintAgent('List setter');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const updated = await bot.updateTask(task.id, { listId: list.id });

      expect(updated.listId).toBe(list.id);
    });

    it('cannot put a task on another organization\'s list', async () => {
      const alice = await ctx.createActor('alice-task-list-iso@example.com');
      const bob = await ctx.createActor('bob-task-list-iso@example.com');

      const aliceList = await alice.createNamedList('Alice only');
      const bobTask = await bob.createTask({ title: 'Bob chore' });

      await expect(bob.updateTask(bobTask.id, { listId: aliceList.id })).rejects.toThrow(
        ValidationError
      );

      const stillUnlisted = await bob.getTask(bobTask.id);
      expect(stillUnlisted.listId).toBeUndefined();
    });

    it('rejects an unknown list', async () => {
      const alice = await ctx.createActor('alice-task-list-unknown@example.com');
      const task = await alice.createTask({ title: 'No such list' });

      await expect(
        alice.updateTask(task.id, { listId: '550e8400-e29b-41d4-a716-446655440099' })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects adding a completed task to a list', async () => {
      const alice = await ctx.createActor('alice-task-list-done@example.com');
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk' });
      await alice.completeTask(task.id);

      await expect(alice.updateTask(task.id, { listId: list.id })).rejects.toThrow(
        ValidationError
      );

      const done = await alice.getTask(task.id);
      expect(done.listId).toBeUndefined();
      expect(done.completedAt).toBeDefined();
    });

    it('rejects moving a completed task so Done cannot change the restored list', async () => {
      const alice = await ctx.createActor('alice-task-list-done-move@example.com');
      const groceries = await alice.createNamedList('Groceries');
      const weekend = await alice.createNamedList('Weekend');
      const task = await alice.createTask({ title: 'Buy milk' });
      await alice.updateTask(task.id, { listId: groceries.id });
      await alice.completeTask(task.id);

      await expect(alice.updateTask(task.id, { listId: weekend.id })).rejects.toThrow(
        ValidationError
      );

      const done = await alice.getTask(task.id);
      expect(done.listId).toBe(groceries.id);
      expect(done.completedAt).toBeDefined();
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Adding an existing task to a list on the board [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-task-list-board@example.com');
    });

    it('shows the list name on the task after picking it in the kit Select', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk' });

      await alice.updateTask(task.id, { listId: list.id });

      await alice.shouldSeeListOnTask(task.id, 'Groceries');
    });

    it('shows the new list after moving the task', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const weekend = await alice.createNamedList('Weekend');
      const task = await alice.createTask({ title: 'Buy milk' });

      await alice.updateTask(task.id, { listId: groceries.id });
      await alice.updateTask(task.id, { listId: weekend.id });

      await alice.shouldSeeListOnTask(task.id, 'Weekend');
    });
  });
});
