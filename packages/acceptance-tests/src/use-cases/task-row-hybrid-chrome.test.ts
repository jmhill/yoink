import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #115: hybrid task-row chrome.
 *
 * Product lock Justin + Polly 2026-09-22:
 * One-pile (named list + Unlisted): complete, title, grip; Edit/Delete
 * behind ⋯ — no pencil/trash icons next to the grip.
 * Smart views (Today / Upcoming / Mine / Done): complete, title, ⋯ only.
 * No grip. Pin stays gone (#111). Theme tokens. Mobile + desktop.
 *
 * Out of scope: Inbox↔Tasks shell, realtime, pin revive, reorder rules.
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Task row hybrid chrome [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-25-hybrid-chrome@example.com');
    });

    it('shows complete, title, and grip on named-list and Unlisted — no Edit/Trash icons', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const notes = await alice.createTask({ title: 'Notes' });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOnePileTaskRowChrome(milk.id);
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);

      await alice.openRailUnlisted();
      await alice.shouldSeeOnePileTaskRowChrome(notes.id);
      await alice.shouldSeeLargeCompleteControlOnTask(notes.id);
    });

    it('offers Edit and Delete from ⋯ on one-pile rows', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: groceries.id });
      const notes = await alice.createTask({ title: 'Notes' });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeTaskRowOverflowActions(milk.id);
      await alice.openTaskEditFromRow(milk.id);
      await alice.shouldSeeExistingTaskEditUi();
      await alice.closeTaskEdit();

      await alice.deleteOpenTaskFromRow(eggs.id);
      await alice.shouldNotSeeTask(eggs.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.openRailUnlisted();
      await alice.shouldSeeTaskRowOverflowActions(notes.id);
    });

    it('shows ⋯ and no grip on Today, Upcoming, Mine, and Done', async () => {
      const call = await alice.createTask({
        title: 'Call',
        dueDate: isoDateOffset(0),
        assigneeId: alice.userId,
      });
      const later = await alice.createTask({
        title: 'Later',
        dueDate: isoDateOffset(3),
      });
      const finished = await alice.createTask({ title: 'Finished' });
      await alice.completeTask(finished.id);

      await alice.useDesktopViewport();

      await alice.openRailSmartView('today');
      await alice.shouldSeeSmartViewTaskRowChrome(call.id);
      await alice.shouldSeeTaskRowOverflowActions(call.id);
      await alice.shouldNotSeeReorderControls();

      await alice.openRailSmartView('upcoming');
      await alice.shouldSeeSmartViewTaskRowChrome(later.id);
      await alice.shouldNotSeeReorderControls();

      await alice.openRailSmartView('mine');
      await alice.shouldSeeSmartViewTaskRowChrome(call.id);
      await alice.shouldNotSeeReorderControls();

      await alice.openRailSmartView('done');
      await alice.shouldSeeSmartViewTaskRowChrome(finished.id);
      await alice.shouldSeeTaskRowOverflowActions(finished.id);
      await alice.shouldNotSeeReorderControls();
    });

    it('uses the same hybrid chrome on a phone', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const notes = await alice.createTask({ title: 'Notes' });
      const call = await alice.createTask({
        title: 'Call',
        dueDate: isoDateOffset(0),
      });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOnePileTaskRowChrome(milk.id);
      await alice.shouldSeeTaskRowOverflowActions(milk.id);

      await alice.openRailUnlisted();
      await alice.shouldSeeOnePileTaskRowChrome(notes.id);

      await alice.openRailSmartView('today');
      await alice.shouldSeeSmartViewTaskRowChrome(call.id);
      await alice.shouldNotSeeReorderControls();
    });

    it('stays readable in light, dark, and tokyo-night and keeps pin gone', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const call = await alice.createTask({
        title: 'Call',
        dueDate: isoDateOffset(0),
      });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOnePileTaskRowChrome(milk.id);
      await alice.shouldNotSeePinControls();

      const appearances = [
        { mode: 'light' as const, colorTheme: 'default' as const },
        { mode: 'dark' as const, colorTheme: 'default' as const },
        { mode: 'light' as const, colorTheme: 'tokyo-night' as const },
        { mode: 'dark' as const, colorTheme: 'tokyo-night' as const },
      ];

      for (const appearance of appearances) {
        await alice.useAppearance(appearance);
        await alice.openRailNamedList('Groceries');
        await alice.shouldSeeOnePileTaskRowChrome(milk.id);
        await alice.shouldSeeTaskRowChromeReadable(milk.id);
        await alice.shouldNotSeePinControls();

        await alice.openToday();
        await alice.shouldSeeSmartViewTaskRowChrome(call.id);
        await alice.shouldSeeTaskRowChromeReadable(call.id);
        await alice.shouldNotSeePinControls();
      }
    }, 90_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Task row hybrid chrome — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs hybrid-chrome operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-25-hybrid-chrome-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeOnePileTaskRowChrome('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeSmartViewTaskRowChrome('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeTaskRowOverflowActions('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeTaskRowChromeReadable('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
