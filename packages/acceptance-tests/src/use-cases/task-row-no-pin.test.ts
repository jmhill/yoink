import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #111: Remove task pin from UI (keep backend pinnedAt).
 *
 * With manual openOrder on one-pile screens, pin no longer re-partitions
 * the list. Remove pin/unpin chrome from task rows (desktop + mobile).
 * Keep pin/unpin API and store fields. Do not change openOrder.
 *
 * Out of scope: deleting pinnedAt, pinned section, realtime, headings,
 * bottom bar.
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Task row without pin chrome [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-remove-task-pin@example.com');
    });

    it('hides pin on named-list and Today rows and leaves one-pile drag working', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: groceries.id });
      const bread = await alice.createTask({ title: 'Bread', listId: groceries.id });
      const call = await alice.createTask({
        title: 'Call',
        dueDate: isoDateOffset(0),
      });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread']);
      await alice.shouldNotSeePinControls();
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);
      await alice.shouldSeeTaskEditControl(milk.id);

      await alice.dragOpenTaskOnto('Milk', 'Eggs');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);
      await alice.shouldNotSeePinControls();

      await alice.openToday();
      await alice.shouldSeeLargeCompleteControlOnTask(call.id);
      await alice.shouldNotSeePinControls();
      await alice.shouldNotSeeReorderControls();
    });

    it('hides pin on a phone named-list and Today row', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const call = await alice.createTask({
        title: 'Call',
        dueDate: isoDateOffset(0),
      });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);
      await alice.shouldNotSeePinControls();

      await alice.openRailSmartView('today');
      await alice.shouldSeeLargeCompleteControlOnTask(call.id);
      await alice.shouldNotSeePinControls();
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Task row without pin chrome — HTTP [${ctx.driverName}]`, () => {
    it('stubs missing pin chrome as browser-only and keeps the pin API', async () => {
      const alice = await ctx.createActor('alice-ui-story-remove-task-pin-http@example.com');
      const task = await alice.createTask({ title: 'Pin me via API' });
      const pinned = await alice.pinTask(task.id);
      expect(pinned.pinnedAt).toBeDefined();
      const unpinned = await alice.unpinTask(task.id);
      expect(unpinned.pinnedAt).toBeUndefined();

      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldNotSeePinControls()).rejects.toThrow(UnsupportedOperationError);
    });
  });
});
