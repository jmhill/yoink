import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #88: explicit Edit control on task rows (kill click-title-to-edit).
 *
 * Title text is just the title — tapping it does not open edit. An icon
 * button in the trailing chrome (with delete, ~44px on touch) opens
 * the existing task edit modal/sheet. Same fields. No new edit surface.
 *
 * Out of scope: capture rows, linkifying URLs in titles, redesigning the
 * edit modal, multi-select, #90 multi-slot drag.
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

async function shouldEditFromControlNotTitle(
  alice: BrowserActor,
  taskId: string
): Promise<void> {
  await alice.shouldSeeTaskEditControl(taskId);
  await alice.shouldNotOpenTaskEditFromTitle(taskId);
  await alice.openTaskEditFromRow(taskId);
  await alice.shouldSeeExistingTaskEditUi();
  await alice.closeTaskEdit();
}

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Task row explicit edit [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-16-explicit-edit@example.com');
    });

    it('does not open edit from the title; Edit opens the existing UI on a named list', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await shouldEditFromControlNotTitle(alice, milk.id);
    });

    it('same on Unlisted and Today', async () => {
      const call = await alice.createTask({
        title: 'Call',
        dueDate: isoDateOffset(0),
      });
      const notes = await alice.createTask({ title: 'Notes' });

      await alice.useDesktopViewport();
      await alice.openToday();
      await shouldEditFromControlNotTitle(alice, call.id);

      await alice.openRailUnlisted();
      await shouldEditFromControlNotTitle(alice, notes.id);
    });

    it('same on a phone named-list, Unlisted, and Today', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const call = await alice.createTask({
        title: 'Call',
        dueDate: isoDateOffset(0),
      });
      const notes = await alice.createTask({ title: 'Notes' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await shouldEditFromControlNotTitle(alice, milk.id);

      await alice.openRailSmartView('today');
      await shouldEditFromControlNotTitle(alice, call.id);

      await alice.openRailUnlisted();
      await shouldEditFromControlNotTitle(alice, notes.id);
    });

    it('keeps complete, delete, drag, and swipe-complete working', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: groceries.id });
      const bread = await alice.createTask({ title: 'Bread', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread']);
      await shouldEditFromControlNotTitle(alice, milk.id);
      await alice.shouldNotSeePinControls();

      await alice.dragOpenTaskOnto('Milk', 'Eggs');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);

      await alice.completeOpenTaskFromRow(eggs.id);
      await alice.shouldNotSeeTask(eggs.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Bread']);

      await alice.deleteOpenTaskFromRow(bread.id);
      await alice.shouldNotSeeTask(bread.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await shouldEditFromControlNotTitle(alice, milk.id);
      await alice.completeOpenTaskBySwipe(milk.id);
      await alice.shouldNotSeeTask(milk.id);
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Task row explicit edit — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs explicit-edit operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-16-explicit-edit-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldNotOpenTaskEditFromTitle('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeTaskEditControl('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.openTaskEditFromRow('task-1')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeExistingTaskEditUi()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.closeTaskEdit()).rejects.toThrow(UnsupportedOperationError);
    });
  });
});
