import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #79: mobile swipe to complete a task.
 *
 * Polly lock: mobile horizontal swipe completes (same outcome as the
 * circle control). Vertical scroll must not accidental-complete. Desktop
 * stays tap-only. No swipe-to-delete, no drag in this PR.
 *
 * Swipe right matches capture swipe-right. Vertical stays scroll so a
 * later drag-reorder can own that axis. Trash stays on captures.
 */

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Mobile swipe to complete [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-11-swipe-complete@example.com');
    });

    it('completes a task by swiping the row on a phone', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.completeOpenTaskBySwipe(milk.id);
      await alice.shouldNotSeeTask(milk.id);

      await alice.openRailSmartView('done');
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);
    });

    it('still completes from the large complete control on a phone', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const eggs = await alice.createTask({ title: 'Eggs', listId: groceries.id });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeLargeCompleteControlOnTask(eggs.id);

      await alice.completeOpenTaskFromRow(eggs.id);
      await alice.shouldNotSeeTask(eggs.id);

      await alice.openRailSmartView('done');
      await alice.shouldSeeLargeCompleteControlOnTask(eggs.id);
      await alice.uncompleteTaskFromRow(eggs.id);
      await alice.shouldNotSeeTask(eggs.id);

      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Eggs']);
    });

    it('does not complete a task when the list is scrolled vertically', async () => {
      const titles = Array.from({ length: 14 }, (_, index) => `Item ${index + 1}`);
      const first = await alice.createTask({ title: titles[0]! });
      for (const title of titles.slice(1)) {
        await alice.createTask({ title });
      }

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailUnlisted();
      await alice.shouldSeeOpenTasksInOrder(titles);

      await alice.scrollTaskListWithoutCompleting(first.id);
      await alice.shouldSeeOpenTasksInOrder(titles);
    }, 60_000);
  });

  describe(`Desktop complete stays tap-only [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-11-desktop-complete@example.com');
    });

    it('does not complete from a horizontal mouse drag; tap still works', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const bread = await alice.createTask({ title: 'Bread', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeLargeCompleteControlOnTask(bread.id);

      await alice.shouldKeepTaskAfterDesktopRowDrag(bread.id);
      await alice.shouldSeeOpenTasksInOrder(['Bread']);

      await alice.completeOpenTaskFromRow(bread.id);
      await alice.shouldNotSeeTask(bread.id);
    }, 45_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Swipe to complete — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs swipe-to-complete operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-11-swipe-complete-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.completeOpenTaskBySwipe('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.scrollTaskListWithoutCompleting('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldKeepTaskAfterDesktopRowDrag('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
