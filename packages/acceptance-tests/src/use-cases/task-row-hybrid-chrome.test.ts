import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #118: tap-to-edit rows (normal mode).
 *
 * Product lock Justin 2026-09-24 (revised 2:40pm CT):
 * Every task screen shows only the complete circle and the title.
 * No ⋯, pencil, trash, or grip. Tap the row (not the circle) to edit.
 * Delete lives in the edit dialog. Swipe-to-complete must not open Edit.
 *
 * Supersedes #115 / #117 row chrome and #88's explicit Edit button.
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Task row tap-to-edit chrome [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-118-tap-edit@example.com');
    });

    it('shows only the complete circle and title on named-list and Unlisted', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const notes = await alice.createTask({ title: 'Notes' });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOnePileTaskRowChrome(milk.id);
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);
      await alice.shouldSeeReorderControls();

      await alice.openRailUnlisted();
      await alice.shouldSeeOnePileTaskRowChrome(notes.id);
      await alice.shouldSeeLargeCompleteControlOnTask(notes.id);
      await alice.shouldSeeReorderControls();
    });

    it('opens edit from the row and deletes from the edit dialog', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: groceries.id });
      const notes = await alice.createTask({ title: 'Notes' });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.openTaskEditFromRow(milk.id);
      await alice.shouldSeeExistingTaskEditUi();
      await alice.closeTaskEdit();

      await alice.deleteOpenTaskFromRow(eggs.id);
      await alice.shouldNotSeeTask(eggs.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.openRailUnlisted();
      await alice.openTaskEditFromRow(notes.id);
      await alice.shouldSeeExistingTaskEditUi();
      await alice.closeTaskEdit();
    });

    it('shows the same chrome on Today, Upcoming, Mine, and Done — no Reorder', async () => {
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
      await alice.shouldNotSeeReorderControls();
      await alice.openTaskEditFromRow(call.id);
      await alice.shouldSeeExistingTaskEditUi();
      await alice.closeTaskEdit();

      await alice.openRailSmartView('upcoming');
      await alice.shouldSeeSmartViewTaskRowChrome(later.id);
      await alice.shouldNotSeeReorderControls();

      await alice.openRailSmartView('mine');
      await alice.shouldSeeSmartViewTaskRowChrome(call.id);
      await alice.shouldNotSeeReorderControls();

      await alice.openRailSmartView('done');
      await alice.shouldSeeSmartViewTaskRowChrome(finished.id);
      await alice.shouldNotSeeReorderControls();
      await alice.openTaskEditFromRow(finished.id);
      await alice.shouldSeeExistingTaskEditUi();
      await alice.closeTaskEdit();
    });

    it('uses the same chrome on a phone', async () => {
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
      await alice.shouldSeeReorderControls();

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
  describe(`Task row tap-to-edit chrome — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs tap-to-edit operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-118-tap-edit-http@example.com');
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
