import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #78: one-pile screens get drag-to-reorder.
 *
 * Polly lock: named-list and Unlisted only. Smart views stay
 * non-reorderable. Same open-order rules. Horizontal swipe owns
 * complete (#79); drag owns the vertical axis / grip handle.
 * Kit up/down is gone once drag works.
 */

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`One-pile drag to reorder [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-12-drag-reorder@example.com');
    });

    it('reorders a named list by dragging and keeps the order after refresh', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.createTask({ title: 'Bread', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread']);
      await alice.shouldSeeReorderControls();

      await alice.dragOpenTaskOnto('Milk', 'Eggs');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);

      await alice.refreshOpenList();
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);
    });

    it('reorders Unlisted by dragging and keeps the order after refresh', async () => {
      await alice.createTask({ title: 'Notes' });
      await alice.createTask({ title: 'Errand' });
      await alice.createTask({ title: 'Call' });

      await alice.useDesktopViewport();
      await alice.openRailUnlisted();
      await alice.shouldSeeOpenTasksInOrder(['Notes', 'Errand', 'Call']);
      await alice.shouldSeeReorderControls();

      await alice.dragOpenTaskOnto('Notes', 'Errand');
      await alice.shouldSeeOpenTasksInOrder(['Errand', 'Notes', 'Call']);

      await alice.refreshOpenList();
      await alice.shouldSeeOpenTasksInOrder(['Errand', 'Notes', 'Call']);
    });

    it('keeps smart views non-reorderable', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({
        title: 'Milk',
        listId: groceries.id,
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

      await alice.completeTask(milk.id);
      await alice.openRailSmartView('done');
      await alice.shouldNotSeeReorderControls();
    });

    it('keeps complete/uncomplete restore and move-on append after a drag', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.createTask({ title: 'Bread', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.dragOpenTaskOnto('Eggs', 'Milk');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);

      await alice.completeOpenTaskFromRow(eggs.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Bread']);

      await alice.openRailSmartView('done');
      await alice.uncompleteTaskFromRow(eggs.id);

      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);

      const notes = await alice.createTask({ title: 'Notes' });
      await alice.updateTask(notes.id, { listId: groceries.id });
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread', 'Notes']);
    });

    it('reorders from a touch drag on a phone without using kit up/down', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.createTask({ title: 'Bread', listId: groceries.id });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeReorderControls();

      await alice.dragOpenTaskOntoByTouch('Milk', 'Eggs');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);
    });

    it('still completes by swipe on a one-pile screen that can drag', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeReorderControls();
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);

      await alice.shouldKeepTaskAfterVerticalRowDrag(milk.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);

      await alice.completeOpenTaskBySwipe(milk.id);
      await alice.shouldNotSeeTask(milk.id);
      await alice.shouldSeeOpenTasksInOrder(['Eggs']);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`One-pile drag to reorder — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs drag-reorder operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-12-drag-reorder-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.dragOpenTaskOnto('Milk', 'Eggs')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.dragOpenTaskOntoByTouch('Milk', 'Eggs')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldKeepTaskAfterVerticalRowDrag('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
