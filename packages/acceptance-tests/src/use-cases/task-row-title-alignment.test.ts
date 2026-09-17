import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #84: align the complete circle and trailing icons with the title.
 *
 * The 44px complete hit target stays. The circle glyph optically centers
 * with the first line of the title — not the whole card, not the metadata
 * row. Grip, edit, and delete glyphs share that same centerline.
 *
 * Out of scope: row redesign, new actions, multi-select, swipe/drag
 * behavior changes, capture rows, drawer chrome.
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

const wrappedTitle =
  'Buy milk eggs bread butter cheese yogurt apples oranges bananas coffee tea and the rest of the weekly groceries list';

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Task row title-line alignment [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-13-title-align@example.com');
    });

    it('aligns the complete circle, title, and trailing icons on a one-line named-list row', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);
      await alice.shouldSeeTaskRowAlignedWithTitle(milk.id);
    });

    it('keeps the circle on the first line of a wrapped title; metadata stays underneath', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const shop = await alice.createTask({
        title: wrappedTitle,
        listId: groceries.id,
        dueDate: isoDateOffset(0),
        assigneeId: alice.userId,
      });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeListOnTask(shop.id, 'Groceries');
      await alice.shouldSeeAssigneeOnTask(shop.id, alice.email);
      await alice.shouldSeeWrappedTaskTitle(shop.id);
      await alice.shouldSeeTaskRowAlignedWithTitle(shop.id);
      await alice.shouldSeeTaskRowMetadataBelowTitle(shop.id);
    });

    it('aligns the same row on Unlisted and Today', async () => {
      const call = await alice.createTask({
        title: 'Call',
        dueDate: isoDateOffset(0),
      });
      const notes = await alice.createTask({ title: 'Notes' });

      await alice.useDesktopViewport();
      await alice.openToday();
      await alice.shouldSeeTaskRowAlignedWithTitle(call.id);
      await alice.shouldSeeTaskRowMetadataBelowTitle(call.id);

      await alice.openRailUnlisted();
      await alice.shouldSeeTaskRowAlignedWithTitle(notes.id);
    });

    it('keeps complete, delete, and drag working on the aligned row', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: groceries.id });
      const bread = await alice.createTask({ title: 'Bread', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread']);
      await alice.shouldSeeTaskRowAlignedWithTitle(milk.id);
      await alice.shouldNotSeePinControls();

      await alice.dragOpenTaskOnto('Milk', 'Eggs');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);

      await alice.completeOpenTaskFromRow(eggs.id);
      await alice.shouldNotSeeTask(eggs.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Bread']);

      await alice.deleteOpenTaskFromRow(bread.id);
      await alice.shouldNotSeeTask(bread.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);
    }, 60_000);

    it('keeps the aligned row and swipe-to-complete on a phone', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const shop = await alice.createTask({
        title: wrappedTitle,
        listId: groceries.id,
        dueDate: isoDateOffset(0),
      });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeLargeCompleteControlOnTask(milk.id);
      await alice.shouldSeeTaskRowAlignedWithTitle(milk.id);
      await alice.shouldSeeWrappedTaskTitle(shop.id);
      await alice.shouldSeeTaskRowAlignedWithTitle(shop.id);
      await alice.shouldSeeTaskRowMetadataBelowTitle(shop.id);

      await alice.completeOpenTaskBySwipe(milk.id);
      await alice.shouldNotSeeTask(milk.id);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Task row title-line alignment — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs title-alignment operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-13-title-align-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeTaskRowAlignedWithTitle('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeTaskRowMetadataBelowTitle('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeWrappedTaskTitle('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.deleteOpenTaskFromRow('task-1')).rejects.toThrow(UnsupportedOperationError);
    });
  });
});
