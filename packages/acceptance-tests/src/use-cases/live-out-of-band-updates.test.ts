import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor, PlaywrightContext } from '@yoink/acceptance-testing';

/**
 * Issue #125: while Yoink is open and visible, bot / other-device
 * changes show up within ~15s with no reload. Product lock: 10–15s
 * delay is fine. Tests use a 250ms interval instead of waiting 10s.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

const mintBot = async (
  alice: BrowserActor,
  ctx: PlaywrightContext,
  name: string
): Promise<CoreActor> => {
  const minted = await alice.mintAgent(name);
  return ctx.createActorWithCredentials({
    email: minted.agent.name,
    userId: minted.agent.userId,
    organizationId: alice.organizationId,
    token: minted.rawToken,
  });
};

const otherDevice = async (
  alice: BrowserActor,
  ctx: PlaywrightContext,
  tokenName: string
): Promise<CoreActor> => {
  const { rawToken } = await alice.createToken(tokenName);
  return ctx.createActorWithCredentials({
    email: alice.email,
    userId: alice.userId,
    organizationId: alice.organizationId,
    token: rawToken,
  });
};

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Live out-of-band updates [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-live-updates@example.com');
    });

    it('shows bot task add, edit, complete, reopen, move, and reorder on the open pile', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const weekend = await alice.createNamedList('Weekend');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: groceries.id });
      const bot = await mintBot(alice, ctx, 'Lane');

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.useShortLiveQueryInterval(250);
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);

      await bot.createTask({ title: 'Bread', listId: groceries.id });
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread']);
      await alice.shouldNotSeeLoadingPlaceholder();

      await bot.updateTask(milk.id, { title: 'Oat milk' });
      await alice.shouldSeeOpenTasksInOrder(['Oat milk', 'Eggs', 'Bread']);

      await bot.completeTask(eggs.id);
      await alice.shouldNotSeeTask(eggs.id);
      await alice.shouldSeeOpenTasksInOrder(['Oat milk', 'Bread']);

      await bot.uncompleteTask(eggs.id);
      await alice.shouldSeeOpenTasksInOrder(['Oat milk', 'Eggs', 'Bread']);

      await bot.updateTask(milk.id, { listId: weekend.id });
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Bread']);

      const open = await bot.listOpenTasksOnList(groceries.id);
      const reversed = [...open].reverse();
      await bot.reorderOpenTasksOnList(
        groceries.id,
        reversed.map((task) => task.id)
      );
      await alice.shouldSeeOpenTasksInOrder(reversed.map((task) => task.title));
    }, 60_000);

    it('updates the list rail and create-task picker when a bot changes lists', async () => {
      await alice.createNamedList('Groceries');
      const bot = await mintBot(alice, ctx, 'List bot');

      await alice.useDesktopViewport();
      await alice.openRailSmartView('today');
      await alice.useShortLiveQueryInterval(250);
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldSeeCreateTaskListPicker();

      await bot.createNamedList('Weekend');
      await alice.shouldSeeRailItems(railWith('Groceries', 'Weekend'));
      await alice.shouldSeeNamedListInCreateTaskPicker('Weekend');

      const lists = await bot.listNamedLists();
      const weekend = lists.find((list) => list.name === 'Weekend');
      if (!weekend) {
        throw new Error('expected Weekend to exist');
      }
      await bot.renameNamedList(weekend.id, 'Errands');
      await alice.shouldSeeRailItems(railWith('Errands', 'Groceries'));
      await alice.shouldSeeNamedListInCreateTaskPicker('Errands');

      await bot.deleteNamedList(weekend.id);
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldNotSeeNamedList('Errands');
    }, 60_000);

    it('shows a laptop API change on the phone without reload', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      const laptop = await otherDevice(alice, ctx, 'laptop');

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Groceries');
      await alice.useShortLiveQueryInterval(250);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await laptop.createTask({ title: 'Phone sees this', listId: groceries.id });
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Phone sees this']);
    }, 60_000);

    it('keeps in-progress capture, edit, rename, sheet, and reorder work across a live refresh', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.createCapture({ content: 'Clip later' });
      const bot = await mintBot(alice, ctx, 'Sneaky bot');
      const laptop = await otherDevice(alice, ctx, 'laptop');

      await alice.useDesktopViewport();
      await alice.useShortLiveQueryInterval(250);
      await alice.pressQuickCaptureShortcut();
      await alice.shouldHaveQuickCaptureFocused();
      await alice.typeIntoFocusedField('still typing');
      await laptop.createCapture({ content: 'From the other device' });
      await alice.shouldSeeCaptureOnCurrentPane('From the other device');
      await alice.shouldSeeFocusedFieldValue('still typing');

      await alice.openPromoteSheet('Clip later');
      await alice.shouldSeePromoteSheet();
      await bot.createNamedList('Weekend');
      await alice.shouldSeeRailItems(railWith('Groceries', 'Weekend'));
      await alice.shouldSeePromoteSheet();
      await alice.cancelPromoteSheet();

      await alice.openRailNamedList('Groceries');
      await alice.focusAddTaskField();
      await alice.typeIntoFocusedField('draft task');
      await bot.createTask({ title: 'Butter', listId: groceries.id });
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Butter']);
      await alice.shouldSeeFocusedFieldValue('draft task');

      await alice.openTaskEditFromRow(milk.id);
      await alice.focusTaskEditTitle();
      await alice.typeIntoFocusedField(' from me');
      await bot.updateTask(milk.id, { title: 'Bot milk' });
      await alice.shouldSeeFocusedFieldValue('Milk from me');
      await alice.saveOpenTaskEdit();
      await alice.shouldSeeOpenTasksInOrder(['Milk from me', 'Eggs', 'Butter']);

      await alice.beginNamedListRenameFromRail('Groceries');
      await alice.typeIntoFocusedField('Groceries and more');
      await bot.createNamedList('Tonight');
      await alice.shouldSeeNamedListRenameDraft('Groceries and more');
      await alice.shouldSeeRailItems(railWith('Groceries', 'Tonight', 'Weekend'));

      await alice.openRailNamedList('Groceries');
      await alice.enterReorderMode();
      await alice.shouldSeeReorderMode();
      await bot.createTask({ title: 'Apples', listId: groceries.id });
      await alice.shouldSeeOpenTasksInOrder(['Milk from me', 'Eggs', 'Butter', 'Apples']);
      await alice.shouldSeeReorderMode();
    }, 60_000);

    it('stops checking while the tab is hidden and checks immediately on return', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      const bot = await mintBot(alice, ctx, 'Hidden-tab bot');

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.useShortLiveQueryInterval(250);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      const visibleGets = await alice.countLiveDataGetsDuring(700);
      expect(visibleGets).toBeGreaterThan(0);

      await alice.hideApp();
      const hiddenGets = await alice.countLiveDataGetsDuring(700);
      expect(hiddenGets).toBe(0);

      await bot.createTask({ title: 'While hidden', listId: groceries.id });
      await alice.showApp();
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'While hidden']);
    }, 60_000);

    it('shows no error UI when a background check fails, then catches up', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      const bot = await mintBot(alice, ctx, 'Flaky bot');

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.useShortLiveQueryInterval(250);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.failBackgroundLiveQueries();
      await alice.countLiveDataGetsDuring(700);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);
      await alice.shouldNotSeeQueryError();
      await alice.shouldNotSeeLoadingPlaceholder();

      await alice.restoreBackgroundLiveQueries();
      await bot.createTask({ title: 'Back online', listId: groceries.id });
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Back online']);
      await alice.shouldNotSeeQueryError();
    }, 60_000);
  });
});
