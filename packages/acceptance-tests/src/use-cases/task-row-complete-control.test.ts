import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #77: task row larger complete control (not a multi-select checkbox).
 *
 * Completing on mobile is finicky. The old checkbox was too small and
 * read as multi-select, not “done.” Replace it with a larger complete
 * control (~44px), one tap still completes/uncompletes, no multi-select.
 *
 * Out of scope: swipe-to-complete (#79), multi-select, drag reorder (#78),
 * changing which tasks appear, mobile drawer (#76 already shipped).
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Task row complete control [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-10-complete-control@example.com');
    });

    it('shows a large complete button, not a checkbox, and completes/uncompletes from it', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);
      await alice.shouldSeePinControls();
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.completeOpenTaskFromRow(milk.id);
      await alice.shouldNotSeeTask(milk.id);

      await alice.openRailSmartView('done');
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);

      await alice.uncompleteTaskFromRow(milk.id);
      await alice.shouldNotSeeTask(milk.id);

      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk']);
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);
    });

    it('keeps Today and Unlisted rows usable with the same complete control', async () => {
      const call = await alice.createTask({
        title: 'Call',
        dueDate: isoDateOffset(0),
      });
      const notes = await alice.createTask({ title: 'Notes' });

      await alice.openToday();
      await alice.shouldSeeLargeCompleteControlOnTask(call.id);
      await alice.shouldSeePinControls();
      await alice.completeOpenTaskFromRow(call.id);
      await alice.shouldNotSeeTask(call.id);

      await alice.openRailUnlisted();
      await alice.shouldSeeLargeCompleteControlOnTask(notes.id);
      await alice.completeOpenTaskFromRow(notes.id);
      await alice.shouldNotSeeTask(notes.id);

      await alice.openRailSmartView('done');
      await alice.shouldSeeLargeCompleteControlOnTask(call.id);
      await alice.shouldSeeLargeCompleteControlOnTask(notes.id);
    });

    it('keeps the large complete control usable on a phone named-list screen', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.completeOpenTaskFromRow(milk.id);
      await alice.shouldNotSeeTask(milk.id);

      await alice.openRailSmartView('done');
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);
      await alice.uncompleteTaskFromRow(milk.id);
      await alice.shouldNotSeeTask(milk.id);

      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk']);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Task row complete control — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs complete-control operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-10-complete-control-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeLargeCompleteControlOnTask('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.completeOpenTaskFromRow('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.uncompleteTaskFromRow('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
