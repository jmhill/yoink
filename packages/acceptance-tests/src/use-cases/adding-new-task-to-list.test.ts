import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor, BrowserActor, AnonymousActor } from '@yoink/acceptance-testing';
import { UnauthorizedError, ValidationError } from '@yoink/acceptance-testing';

/**
 * Story 4: Add a new task to a list directly.
 *
 * A list is an optional single bucket. This story creates a new task already
 * on a named list — you do not have to create unlisted then add. Unknown or
 * other-org lists are rejected. New tasks are open. Take-off is a later story.
 */
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Adding a new task to a list directly [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-new-task-list@example.com');
      anonymous = ctx.createAnonymousActor();
    });

    it('creates a new task already on a named list', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk', listId: list.id });

      expect(task.listId).toBe(list.id);
      expect(task.completedAt).toBeUndefined();
    });

    it('creates a task without a list as unlisted', async () => {
      const task = await alice.createTask({ title: 'Loose end' });

      expect(task.listId).toBeUndefined();
    });

    it('requires authentication to create a task on a list', async () => {
      await expect(
        anonymous.createTask({
          title: 'Nope',
          listId: '550e8400-e29b-41d4-a716-446655440001',
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Adding a new task to a list directly — API [${ctx.driverName}]`, () => {
    it('lets an agent token create a task on a list in the same organization', async () => {
      const alice = await ctx.createActor('alice-new-task-list-agent@example.com');
      const list = await alice.createNamedList('Shared board');

      const minted = await alice.mintAgent('List creator');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const task = await bot.createTask({ title: 'Bot chore', listId: list.id });

      expect(task.listId).toBe(list.id);
      expect(task.completedAt).toBeUndefined();
    });

    it('cannot create a task on another organization\'s list', async () => {
      const alice = await ctx.createActor('alice-new-task-list-iso@example.com');
      const bob = await ctx.createActor('bob-new-task-list-iso@example.com');

      const aliceList = await alice.createNamedList('Alice only');

      await expect(
        bob.createTask({ title: 'Bob chore', listId: aliceList.id })
      ).rejects.toThrow(ValidationError);

      const bobsTasks = await bob.listTasks('all');
      expect(bobsTasks.some((task) => task.title === 'Bob chore')).toBe(false);
    });

    it('rejects an unknown list', async () => {
      const alice = await ctx.createActor('alice-new-task-list-unknown@example.com');

      await expect(
        alice.createTask({
          title: 'No such list',
          listId: '550e8400-e29b-41d4-a716-446655440099',
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Adding a new task to a list directly on the board [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-new-task-list-board@example.com');
    });

    it('shows the new task on the list picked in the kit Select', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk', listId: list.id });

      await alice.shouldSeeListOnTask(task.id, 'Groceries');
    });

    it('creates from the board without a list as unlisted', async () => {
      const task = await alice.createTask({ title: 'Loose end' });

      await alice.shouldNotSeeListOnTask(task.id);
    });
  });
});
