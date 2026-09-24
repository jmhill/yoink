import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #118: reorder mode + drop-slot feedback.
 *
 * Named list and Unlisted get a Reorder button. In reorder mode: grips
 * show, tap/circle/swipe do nothing, drag from anywhere, header reads
 * Reorder with Done. While dragging, neighbors slide apart and a
 * primary-colored insertion line marks the landing slot. Release saves.
 * Done or navigating away exits. Smart views get no Reorder button.
 */

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Reorder mode and drop-slot feedback [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-118-reorder-mode@example.com');
    });

    it('enters reorder mode on a named list, shows grips, and Done returns to normal', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeReorderControls();
      await alice.shouldSeeOnePileTaskRowChrome(milk.id);

      await alice.enterReorderMode();
      await alice.shouldSeeReorderMode();
      await alice.shouldNotOpenTaskEditInReorderMode(milk.id);

      await alice.exitReorderMode();
      await alice.shouldSeeOnePileTaskRowChrome(milk.id);
    });

    it('shows no Reorder button on smart views', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      await alice.createTask({
        title: 'Call',
        dueDate: today,
        assigneeId: alice.userId,
      });

      await alice.useDesktopViewport();
      await alice.openRailSmartView('today');
      await alice.shouldNotSeeReorderControls();
      await alice.openRailSmartView('upcoming');
      await alice.shouldNotSeeReorderControls();
      await alice.openRailSmartView('mine');
      await alice.shouldNotSeeReorderControls();
      await alice.openRailSmartView('done');
      await alice.shouldNotSeeReorderControls();
    });

    it('shows a real gap and accent insertion line during a multi-slot drag and saves on release', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.createTask({ title: 'Bread', listId: groceries.id });
      await alice.createTask({ title: 'Butter', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread', 'Butter']);

      await alice.shouldSeeDropSlotWhileDragging('Butter', 'Milk');
      await alice.shouldSeeOpenTasksInOrder(['Butter', 'Milk', 'Eggs', 'Bread']);

      await alice.refreshOpenList();
      await alice.shouldSeeOpenTasksInOrder(['Butter', 'Milk', 'Eggs', 'Bread']);
    });

    it('exits reorder mode when navigating away', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Call', dueDate: new Date().toISOString().split('T')[0]! });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.enterReorderMode();
      await alice.shouldSeeReorderMode();

      await alice.openRailSmartView('today');
      await alice.shouldNotSeeReorderControls();

      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOnePileTaskRowChrome(milk.id);
      await alice.shouldSeeReorderControls();
    });

    it('works on a phone named list and Unlisted', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.createTask({ title: 'Notes' });
      await alice.createTask({ title: 'Errand' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.enterReorderMode();
      await alice.shouldSeeReorderMode();
      await alice.shouldNotOpenTaskEditInReorderMode(milk.id);
      await alice.exitReorderMode();

      await alice.dragOpenTaskOntoByTouch('Milk', 'Eggs');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk']);

      await alice.openRailUnlisted();
      await alice.shouldSeeReorderControls();
      await alice.enterReorderMode();
      await alice.shouldSeeReorderMode();
      await alice.exitReorderMode();
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Reorder mode and drop-slot feedback — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs reorder-mode operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-118-reorder-mode-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.enterReorderMode()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.exitReorderMode()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeReorderMode()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeDropSlotWhileDragging('Milk', 'Eggs')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldNotOpenTaskEditInReorderMode('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
