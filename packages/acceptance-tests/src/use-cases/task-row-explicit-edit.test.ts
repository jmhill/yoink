import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #118: tap the row to edit (reverses #88's explicit Edit button).
 *
 * Tapping anywhere except the complete circle opens the existing edit
 * dialog. The circle still completes (or uncompletes on Done). Swipe
 * completes and must not also open Edit.
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

async function shouldEditFromRowNotCircle(
  alice: BrowserActor,
  taskId: string
): Promise<void> {
  await alice.shouldSeeTaskEditControl(taskId);
  await alice.openTaskEditFromRow(taskId);
  await alice.shouldSeeExistingTaskEditUi();
  await alice.closeTaskEdit();
}

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Task row tap-to-edit [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-118-row-edit@example.com');
    });

    it('opens edit from the row body on a named list, not from the circle', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await shouldEditFromRowNotCircle(alice, milk.id);
    });

    it('same on Unlisted and Today', async () => {
      const call = await alice.createTask({
        title: 'Call',
        dueDate: isoDateOffset(0),
      });
      const notes = await alice.createTask({ title: 'Notes' });

      await alice.useDesktopViewport();
      await alice.openToday();
      await shouldEditFromRowNotCircle(alice, call.id);

      await alice.openRailUnlisted();
      await shouldEditFromRowNotCircle(alice, notes.id);
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
      await shouldEditFromRowNotCircle(alice, milk.id);

      await alice.openRailSmartView('today');
      await shouldEditFromRowNotCircle(alice, call.id);

      await alice.openRailUnlisted();
      await shouldEditFromRowNotCircle(alice, notes.id);
    });

    it('keeps complete, delete, drag, and swipe-complete working without opening Edit on swipe', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: groceries.id });
      const bread = await alice.createTask({ title: 'Bread', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread']);
      await shouldEditFromRowNotCircle(alice, milk.id);
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
      await shouldEditFromRowNotCircle(alice, milk.id);
      await alice.completeOpenTaskBySwipe(milk.id);
      await alice.shouldNotSeeTask(milk.id);
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Task row tap-to-edit — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs tap-to-edit operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-118-row-edit-http@example.com');
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
