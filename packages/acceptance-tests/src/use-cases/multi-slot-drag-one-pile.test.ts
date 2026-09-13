import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #90: one continuous drag can move a task across any number of
 * open slots on named-list and Unlisted screens.
 *
 * Release persists the final open order once (same open-order rules).
 * Smart views stay non-reorderable. Swipe-right complete stays.
 *
 * Out of scope: changing open-order domain rules, multi-select,
 * bringing back kit up/down as the primary path.
 */

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`One-pile multi-slot drag [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-19-multi-slot-drag@example.com');
    });

    it('drags the bottom open task to the top in one gesture and keeps it after refresh', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.createTask({ title: 'Bread', listId: groceries.id });
      await alice.createTask({ title: 'Butter', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread', 'Butter']);
      await alice.shouldSeeReorderControls();

      await alice.dragOpenTaskOnto('Butter', 'Milk');
      await alice.shouldSeeOpenTasksInOrder(['Butter', 'Milk', 'Eggs', 'Bread']);

      await alice.refreshOpenList();
      await alice.shouldSeeOpenTasksInOrder(['Butter', 'Milk', 'Eggs', 'Bread']);
    });

    it('drags the top open task to the bottom in one gesture', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.createTask({ title: 'Bread', listId: groceries.id });
      await alice.createTask({ title: 'Butter', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread', 'Butter']);

      await alice.dragOpenTaskOnto('Milk', 'Butter');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Bread', 'Butter', 'Milk']);
    });

    it('still moves one slot and reorders Unlisted across many slots', async () => {
      await alice.createTask({ title: 'Notes' });
      await alice.createTask({ title: 'Errand' });
      await alice.createTask({ title: 'Call' });
      await alice.createTask({ title: 'Pack' });

      await alice.useDesktopViewport();
      await alice.openRailUnlisted();
      await alice.shouldSeeOpenTasksInOrder(['Notes', 'Errand', 'Call', 'Pack']);
      await alice.shouldSeeReorderControls();

      await alice.dragOpenTaskOnto('Notes', 'Errand');
      await alice.shouldSeeOpenTasksInOrder(['Errand', 'Notes', 'Call', 'Pack']);

      await alice.dragOpenTaskOnto('Pack', 'Errand');
      await alice.shouldSeeOpenTasksInOrder(['Pack', 'Errand', 'Notes', 'Call']);

      await alice.refreshOpenList();
      await alice.shouldSeeOpenTasksInOrder(['Pack', 'Errand', 'Notes', 'Call']);
    });

    it('keeps smart views non-reorderable and swipe-right complete on a one-pile screen', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({
        title: 'Milk',
        listId: groceries.id,
        dueDate: today,
        assigneeId: alice.userId,
      });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailSmartView('today');
      await alice.shouldNotSeeReorderControls();
      await alice.openRailSmartView('upcoming');
      await alice.shouldNotSeeReorderControls();
      await alice.openRailSmartView('mine');
      await alice.shouldNotSeeReorderControls();

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

    it('reorders across many slots from a touch drag on a phone', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.createTask({ title: 'Bread', listId: groceries.id });
      await alice.createTask({ title: 'Butter', listId: groceries.id });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeReorderControls();

      await alice.dragOpenTaskOntoByTouch('Butter', 'Milk');
      await alice.shouldSeeOpenTasksInOrder(['Butter', 'Milk', 'Eggs', 'Bread']);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`One-pile multi-slot drag — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs multi-slot drag and swipe operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-19-multi-slot-drag-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.dragOpenTaskOnto('Butter', 'Milk')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.dragOpenTaskOntoByTouch('Butter', 'Milk')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldKeepTaskAfterVerticalRowDrag('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.completeOpenTaskBySwipe('task-1')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldNotSeeReorderControls()).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
