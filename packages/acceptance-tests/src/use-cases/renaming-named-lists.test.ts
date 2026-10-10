import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor, BrowserActor, AnonymousActor } from '@yoink/acceptance-testing';
import {
  UnauthorizedError,
  ValidationError,
  ConflictError,
  UnsupportedOperationError,
} from '@yoink/acceptance-testing';

/**
 * Issue #122: Rename a named list.
 *
 * Only the name changes. Naming rules match create; the list’s own current
 * name is excluded from the duplicate check so capitalization-only works.
 * Humans rename from the rail ⋯ menu; bots PATCH /api/lists/:id with {name}.
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list', 'New project'];

usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Renaming named lists [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-rename-list@example.com');
      anonymous = ctx.createAnonymousActor();
    });

    it('renames a list and shows the new name among the org lists', async () => {
      const list = await alice.createNamedList('Groceries');

      const renamed = await alice.renameNamedList(list.id, 'Shopping');

      expect(renamed.id).toBe(list.id);
      expect(renamed.name).toBe('Shopping');
      expect(renamed.createdById).toBe(list.createdById);
      expect(renamed.createdAt).toBe(list.createdAt);

      const lists = await alice.listNamedLists();
      expect(lists.map((item) => item.name)).toContain('Shopping');
      expect(lists.map((item) => item.name)).not.toContain('Groceries');
    });

    it('rejects a blank name and keeps the old name', async () => {
      const list = await alice.createNamedList('Groceries');

      await expect(alice.renameNamedList(list.id, '')).rejects.toThrow(ValidationError);
      await expect(alice.renameNamedList(list.id, '   ')).rejects.toThrow(ValidationError);

      const lists = await alice.listNamedLists();
      expect(lists.map((item) => item.name)).toEqual(['Groceries']);
    });

    it('rejects a name over 200 characters and keeps the old name', async () => {
      const list = await alice.createNamedList('Groceries');

      await expect(alice.renameNamedList(list.id, 'a'.repeat(201))).rejects.toThrow(
        ValidationError
      );

      const lists = await alice.listNamedLists();
      expect(lists.map((item) => item.name)).toEqual(['Groceries']);
    });

    it('rejects a name another list already has ignoring case and keeps the old name', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createNamedList('Weekend');

      await expect(alice.renameNamedList(list.id, 'Weekend')).rejects.toThrow(ConflictError);
      await expect(alice.renameNamedList(list.id, 'weekend')).rejects.toThrow(ConflictError);

      const lists = await alice.listNamedLists();
      expect(lists.map((item) => item.name)).toEqual(
        expect.arrayContaining(['Groceries', 'Weekend'])
      );
    });

    it('allows changing only the capitalization of its own name', async () => {
      const list = await alice.createNamedList('groceries');

      const renamed = await alice.renameNamedList(list.id, 'Groceries');

      expect(renamed.name).toBe('Groceries');
      expect(renamed.id).toBe(list.id);
      const lists = await alice.listNamedLists();
      expect(lists.map((item) => item.name)).toEqual(['Groceries']);
    });

    it('requires authentication to rename a list', async () => {
      await expect(
        anonymous.renameNamedList('550e8400-e29b-41d4-a716-446655440000', 'Shopping')
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Renaming named lists — API [${ctx.driverName}]`, () => {
    it('lets an agent token rename a named list in the same organization', async () => {
      const alice = await ctx.createActor('alice-rename-list-agent@example.com');
      const list = await alice.createNamedList('Bot board');

      const minted = await alice.mintAgent('List renamer');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const renamed = await bot.renameNamedList(list.id, 'Renamed board');

      expect(renamed.name).toBe('Renamed board');
      expect(renamed.id).toBe(list.id);

      const aliceLists = await alice.listNamedLists();
      expect(aliceLists.map((item) => item.name)).toContain('Renamed board');
      expect(aliceLists.map((item) => item.name)).not.toContain('Bot board');
    });

    it('leaves tasks, their order, assignees, and list membership untouched', async () => {
      const alice = await ctx.createActor('alice-rename-list-tasks@example.com');
      const list = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({
        title: 'Milk',
        listId: list.id,
        assigneeId: alice.userId,
      });
      const eggs = await alice.createTask({ title: 'Eggs', listId: list.id });
      await alice.reorderOpenTasksOnList(list.id, [eggs.id, milk.id]);

      await alice.renameNamedList(list.id, 'Shopping');

      const open = await alice.listOpenTasksOnList(list.id);
      expect(open.map((task) => task.title)).toEqual(['Eggs', 'Milk']);

      const milkAfter = await alice.getTask(milk.id);
      expect(milkAfter.listId).toBe(list.id);
      expect(milkAfter.assigneeId).toBe(alice.userId);
      expect(milkAfter.title).toBe('Milk');
      expect(milkAfter.openOrder).toBe(1);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Renaming named lists on the board [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-rename-list-board@example.com');
    });

    it('offers Rename next to Delete on phone and desktop and saves in place', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeNamedListOverflowOnRail('Groceries');

      const renamed = await alice.renameNamedListFromRail('Groceries', 'Shopping', {
        submit: 'enter',
      });
      expect(renamed.id).toBe(list.id);
      expect(renamed.name).toBe('Shopping');
      await alice.shouldSeeRailItems(railWith('Shopping'));
      await alice.shouldSeeTaskPlace('Shopping', '1 open');
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Shopping');
      await alice.shouldSeeNamedListOverflowOnRail('Shopping');
      await alice.renameNamedListFromRail('Shopping', 'Errands', { submit: 'done' });
      await alice.shouldSeeRailItems(railWith('Errands'));
      await alice.openRailNamedList('Errands');
      await alice.shouldNotSeeMobileTasksRail();
      await alice.shouldSeeTaskPlace('Errands', '1 open');
    }, 60_000);

    it('refuses a blank name from the rail and keeps the old name', async () => {
      await alice.createNamedList('Groceries');
      await alice.useDesktopViewport();

      await expect(alice.renameNamedListFromRail('Groceries', '')).rejects.toThrow(
        ValidationError
      );

      await alice.shouldSeeRailItems(railWith('Groceries'));
    }, 60_000);

    it('refuses a duplicate name from the rail and keeps the old name', async () => {
      await alice.createNamedList('Groceries');
      await alice.createNamedList('Weekend');
      await alice.useDesktopViewport();

      await expect(alice.renameNamedListFromRail('Groceries', 'weekend')).rejects.toThrow(
        ConflictError
      );

      await alice.shouldSeeRailItems(railWith('Groceries', 'Weekend'));
    }, 60_000);

    it('allows a capitalization-only rename from the rail', async () => {
      const list = await alice.createNamedList('groceries');
      await alice.useDesktopViewport();
      await alice.openRailNamedList('groceries');

      const renamed = await alice.renameNamedListFromRail('groceries', 'Groceries');
      expect(renamed.id).toBe(list.id);
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldSeeTaskPlace('Groceries', '0 open');
    }, 60_000);

    it('updates the name everywhere on the device and leaves tasks untouched', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createNamedList('Weekend');
      const milk = await alice.createTask({
        title: 'Milk',
        listId: groceries.id,
        dueDate: isoDateOffset(0),
        assigneeId: alice.userId,
      });
      await alice.createTask({
        title: 'Eggs',
        listId: groceries.id,
        dueDate: isoDateOffset(2),
      });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.renameNamedListFromRail('Groceries', 'Shopping');

      await alice.shouldSeeRailItems(railWith('Shopping', 'Weekend'));
      await alice.shouldSeeTaskPlace('Shopping', '2 open');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);
      await alice.shouldSeeListOnTask(milk.id, 'Shopping');
      await alice.shouldSeeAssigneeOnTask(milk.id, alice.email);

      await alice.openRailSmartView('today');
      await alice.shouldSeePileGroupsInTodaySection('due-today', ['Shopping']);
      await alice.shouldSeeTasksInTodaySectionPileGroup('due-today', 'Shopping', ['Milk']);

      await alice.openRailSmartView('upcoming');
      await alice.shouldSeePileGroups(['Shopping']);
      await alice.shouldSeeTasksInPileGroup('Shopping', ['Eggs']);
    }, 60_000);

    it('cancelling Escape or clicking away leaves the old name', async () => {
      await alice.createNamedList('Groceries');
      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');

      await alice.cancelNamedListRenameFromRail('Groceries', 'Shopping', 'escape');
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldSeeTaskPlace('Groceries', '0 open');

      await alice.cancelNamedListRenameFromRail('Groceries', 'Errands', 'click-away');
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldSeeTaskPlace('Groceries', '0 open');
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Renaming named lists on the board — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs rail rename as browser-only', async () => {
      const alice = await ctx.createActor('alice-rename-list-board-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.renameNamedListFromRail('Groceries', 'Shopping')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(
        actor.cancelNamedListRenameFromRail('Groceries', 'Shopping', 'escape')
      ).rejects.toThrow(UnsupportedOperationError);
    });
  });
});
