import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor, PlaywrightContext } from '@yoink/acceptance-testing';

/**
 * Issue #125: while Yoink is open and visible, bot / other-device
 * changes show up within ~15s with no reload. Product lock: 10–15s
 * delay is fine. Tests use a 250ms interval instead of waiting 10s.
 *
 * Trunk flake (run 37949425940): a 10s UI poll can miss one slow
 * in-flight GET that started before the bot write. Wait for a live
 * GET whose JSON already matches, started before the write, then
 * assert the UI. That is the 15s product SLA, not a longer poll.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

const titlesAre =
  (expected: string[]) =>
  (tasks: Array<{ title: string }>): boolean =>
    tasks.length === expected.length &&
    expected.every((title, index) => tasks[index]?.title === title);

const namedListsAre =
  (expected: string[]) =>
  (lists: Array<{ name: string }>): boolean => {
    const got = lists.map((list) => list.name).sort();
    const want = [...expected].sort();
    return got.length === want.length && got.every((name, index) => name === want[index]);
  };

const capturesInclude =
  (content: string) =>
  (captures: Array<{ content: string }>): boolean =>
    captures.some((capture) => capture.content === content);

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

      const pendingBread = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Milk', 'Eggs', 'Bread'])
      );
      await bot.createTask({ title: 'Bread', listId: groceries.id });
      await pendingBread;
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread']);
      await alice.shouldNotSeeLoadingPlaceholder();

      const pendingOatMilk = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Oat milk', 'Eggs', 'Bread'])
      );
      await bot.updateTask(milk.id, { title: 'Oat milk' });
      await pendingOatMilk;
      await alice.shouldSeeOpenTasksInOrder(['Oat milk', 'Eggs', 'Bread']);

      const pendingComplete = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Oat milk', 'Bread'])
      );
      await bot.completeTask(eggs.id);
      await pendingComplete;
      await alice.shouldNotSeeTask(eggs.id);
      await alice.shouldSeeOpenTasksInOrder(['Oat milk', 'Bread']);

      const pendingReopen = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Oat milk', 'Eggs', 'Bread'])
      );
      await bot.uncompleteTask(eggs.id);
      await pendingReopen;
      await alice.shouldSeeOpenTasksInOrder(['Oat milk', 'Eggs', 'Bread']);

      const pendingMove = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Eggs', 'Bread'])
      );
      await bot.updateTask(milk.id, { listId: weekend.id });
      await pendingMove;
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Bread']);

      const open = await bot.listOpenTasksOnList(groceries.id);
      const reversed = [...open].reverse();
      const reorderedTitles = reversed.map((task) => task.title);
      const pendingReorder = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(reorderedTitles)
      );
      await bot.reorderOpenTasksOnList(
        groceries.id,
        reversed.map((task) => task.id)
      );
      await pendingReorder;
      await alice.shouldSeeOpenTasksInOrder(reorderedTitles);
    }, 60_000);

    it('updates the list rail and create-task picker when a bot changes lists', async () => {
      await alice.createNamedList('Groceries');
      const bot = await mintBot(alice, ctx, 'List bot');

      await alice.useDesktopViewport();
      await alice.openRailSmartView('today');
      await alice.useShortLiveQueryInterval(250);
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldSeeCreateTaskListPicker();

      const pendingWeekend = alice.awaitLiveNamedLists(
        namedListsAre(['Groceries', 'Weekend'])
      );
      await bot.createNamedList('Weekend');
      await pendingWeekend;
      await alice.shouldSeeRailItems(railWith('Groceries', 'Weekend'));
      await alice.shouldSeeNamedListInCreateTaskPicker('Weekend');

      const lists = await bot.listNamedLists();
      const weekend = lists.find((list) => list.name === 'Weekend');
      if (!weekend) {
        throw new Error('expected Weekend to exist');
      }
      const pendingErrands = alice.awaitLiveNamedLists(
        namedListsAre(['Errands', 'Groceries'])
      );
      await bot.renameNamedList(weekend.id, 'Errands');
      await pendingErrands;
      await alice.shouldSeeRailItems(railWith('Errands', 'Groceries'));
      await alice.shouldSeeNamedListInCreateTaskPicker('Errands');

      const pendingDelete = alice.awaitLiveNamedLists(namedListsAre(['Groceries']));
      await bot.deleteNamedList(weekend.id);
      await pendingDelete;
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

      const pendingPhone = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Milk', 'Phone sees this'])
      );
      await laptop.createTask({ title: 'Phone sees this', listId: groceries.id });
      await pendingPhone;
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
      const pendingCapture = alice.awaitLiveInboxCaptures(
        capturesInclude('From the other device')
      );
      await laptop.createCapture({ content: 'From the other device' });
      await pendingCapture;
      await alice.shouldSeeCaptureOnCurrentPane('From the other device');
      await alice.shouldSeeFocusedFieldValue('still typing');

      await alice.openPromoteSheet('Clip later');
      await alice.shouldSeePromoteSheet();
      const pendingWeekend = alice.awaitLiveNamedLists(
        namedListsAre(['Groceries', 'Weekend'])
      );
      await bot.createNamedList('Weekend');
      await pendingWeekend;
      await alice.shouldSeeRailItems(railWith('Groceries', 'Weekend'));
      await alice.shouldSeePromoteSheet();
      await alice.cancelPromoteSheet();

      await alice.openRailNamedList('Groceries');
      await alice.focusAddTaskField();
      await alice.typeIntoFocusedField('draft task');
      const pendingButter = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Milk', 'Eggs', 'Butter'])
      );
      await bot.createTask({ title: 'Butter', listId: groceries.id });
      await pendingButter;
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Butter']);
      await alice.shouldSeeFocusedFieldValue('draft task');

      await alice.openTaskEditFromRow(milk.id);
      await alice.focusTaskEditTitle();
      await alice.typeIntoFocusedField(' from me');
      const pendingBotMilk = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Bot milk', 'Eggs', 'Butter'])
      );
      await bot.updateTask(milk.id, { title: 'Bot milk' });
      await pendingBotMilk;
      await alice.shouldSeeFocusedFieldValue('Milk from me');
      await alice.saveOpenTaskEdit();
      await alice.shouldSeeOpenTasksInOrder(['Milk from me', 'Eggs', 'Butter']);

      await alice.beginNamedListRenameFromRail('Groceries');
      await alice.typeIntoFocusedField('Groceries and more');
      const pendingTonight = alice.awaitLiveNamedLists(
        namedListsAre(['Groceries', 'Tonight', 'Weekend'])
      );
      await bot.createNamedList('Tonight');
      await pendingTonight;
      await alice.shouldSeeNamedListRenameDraft('Groceries and more');
      await alice.shouldSeeRailItems(railWith('Groceries', 'Tonight', 'Weekend'));

      await alice.openRailNamedList('Groceries');
      await alice.enterReorderMode();
      await alice.shouldSeeReorderMode();
      const pendingApples = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Milk from me', 'Eggs', 'Butter', 'Apples'])
      );
      await bot.createTask({ title: 'Apples', listId: groceries.id });
      await pendingApples;
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

      const pendingHidden = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Milk', 'While hidden'])
      );
      await bot.createTask({ title: 'While hidden', listId: groceries.id });
      await alice.showApp();
      await pendingHidden;
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'While hidden']);
    }, 60_000);

    it('keeps a user complete when a slower pile poll lands afterwards', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: groceries.id });

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Groceries');
      await alice.useShortLiveQueryInterval(250);
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);

      await alice.completeOpenTaskFromRowAgainstStalePilePoll(eggs.id, groceries.id);
      await alice.shouldNotSeeTask(eggs.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);
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
      const pendingOnline = alice.awaitLiveOpenListTasks(
        groceries.id,
        titlesAre(['Milk', 'Back online'])
      );
      await bot.createTask({ title: 'Back online', listId: groceries.id });
      await pendingOnline;
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Back online']);
      await alice.shouldNotSeeQueryError();
    }, 60_000);
  });
});
