import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Projects plan story 12 (#144): Work screen with a Now view.
 *
 * Polly lock (Sun Oct 11): /work now; phone Tasks tab opens it; desktop
 * Now sits above Today. Mine is a heading toggle (`?mine=true`), reset
 * to everyone on each visit. Owner labels hide the viewer and unowned
 * rows. Next actions: dated first, then project name. Due is Today’s
 * rule minus shown next actions. List counts ignore Mine and count
 * named lists only. Completing a next action from Now offers What’s next.
 */

const WALKTHROUGH_STORY = '144-work-screen';

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

const nowSubcopyFor = (nextActionCount: number, dueCount: number): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const next =
    nextActionCount === 1 ? '1 next action' : `${nextActionCount} next actions`;
  const due = dueCount === 1 ? '1 due' : `${dueCount} due`;
  return `${weekday} ${month} ${day} · ${next} · ${due}`;
};

const mintBot = async (
  alice: CoreActor,
  ctx: {
    createActorWithCredentials: (credentials: {
      email: string;
      userId: string;
      organizationId: string;
      token: string;
    }) => CoreActor;
  },
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

const seedNow = async (alice: CoreActor, bot: CoreActor) => {
  const chores = await alice.createNamedList('Chores');
  const weekend = await alice.createNamedList('Weekend');
  const empty = await alice.createNamedList('Empty');

  const alpha = await alice.createProject({ name: 'Alpha' });
  const bravo = await alice.createProject({ name: 'Bravo' });
  const charlie = await alice.createProject({ name: 'Charlie' });
  const delta = await alice.createProject({ name: 'Delta' });
  const echo = await alice.createProject({ name: 'Echo' });
  const golf = await alice.createProject({ name: 'Golf' });
  await alice.changeProjectStatus(echo.id, { status: 'waiting', waitingOn: 'Mike' });

  const alphaNa = await alice.createTask({
    title: 'Alpha next',
    dueDate: isoDateOffset(-2),
    assigneeId: alice.userId,
    projectId: alpha.id,
    listId: chores.id,
  });
  const bravoNa = await alice.createTask({
    title: 'Bravo next',
    dueDate: isoDateOffset(5),
    projectId: bravo.id,
    listId: weekend.id,
  });
  const charlieNa = await alice.createTask({
    title: 'Charlie next',
    dueDate: isoDateOffset(5),
    projectId: charlie.id,
  });
  const deltaNa = await alice.createTask({
    title: 'Delta next',
    assigneeId: bot.userId,
    projectId: delta.id,
  });
  const echoNa = await alice.createTask({
    title: 'Echo waiting next',
    dueDate: isoDateOffset(-1),
    projectId: echo.id,
  });
  const aliceLoose = await alice.createTask({
    title: 'Alice overdue loose',
    dueDate: isoDateOffset(-4),
    assigneeId: alice.userId,
  });
  await alice.createTask({
    title: 'Future weekend',
    dueDate: isoDateOffset(10),
    listId: weekend.id,
  });
  await alice.createTask({ title: 'Undated loose' });
  const leftover = await alice.createTask({
    title: 'Golf leftover',
    dueDate: isoDateOffset(-1),
    projectId: golf.id,
  });
  await alice.createTask({ title: 'Alpha later', projectId: alpha.id });

  await alice.setNextAction(alpha.id, { taskId: alphaNa.id });
  await alice.setNextAction(bravo.id, { taskId: bravoNa.id });
  await alice.setNextAction(charlie.id, { taskId: charlieNa.id });
  await alice.setNextAction(delta.id, { taskId: deltaNa.id });
  await alice.setNextAction(echo.id, { taskId: echoNa.id });

  return {
    chores,
    weekend,
    empty,
    alpha,
    echo,
    alphaNa,
    bravoNa,
    charlieNa,
    deltaNa,
    echoNa,
    aliceLoose,
    leftover,
  };
};

usingDrivers(['http'] as const, (ctx) => {
  describe(`Work Now API [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let bot: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-144-work-http@example.com');
      bot = await mintBot(alice, ctx, 'Lane');
    });

    it('returns next actions, due, and lists with Polly’s owner and Due rules', async () => {
      const seeded = await seedNow(alice, bot);

      const everyone = await alice.listNowNextActions({ owner: 'all' });
      expect(everyone.items.map((item) => item.task.id)).toEqual([
        seeded.alphaNa.id,
        seeded.bravoNa.id,
        seeded.charlieNa.id,
        seeded.deltaNa.id,
      ]);
      expect(everyone.items.map((item) => item.project.name)).toEqual([
        'Alpha',
        'Bravo',
        'Charlie',
        'Delta',
      ]);
      expect(everyone.items.map((item) => item.task.assigneeId ?? null)).toEqual([
        alice.userId,
        null,
        null,
        bot.userId,
      ]);
      expect(everyone.total).toBe(4);
      expect(everyone.hasMore).toBe(false);
      expect(everyone.nextCursor).toBeNull();

      const aliceMine = await alice.listNowNextActions({ owner: 'me' });
      expect(aliceMine.items.map((item) => item.task.id)).toEqual([seeded.alphaNa.id]);
      expect(aliceMine.total).toBe(1);

      const botAll = await bot.listNowNextActions({ owner: 'all' });
      expect(botAll.items.map((item) => item.task.id)).toEqual([
        seeded.alphaNa.id,
        seeded.bravoNa.id,
        seeded.charlieNa.id,
        seeded.deltaNa.id,
      ]);
      const botMine = await bot.listNowNextActions({ owner: 'me' });
      expect(botMine.items.map((item) => item.task.id)).toEqual([seeded.deltaNa.id]);

      const dueAll = await alice.listNowDue({ owner: 'all' });
      expect(dueAll.tasks.map((task) => task.id)).toEqual([
        seeded.aliceLoose.id,
        seeded.echoNa.id,
        seeded.leftover.id,
      ]);
      expect(dueAll.total).toBe(3);

      const dueMine = await alice.listNowDue({ owner: 'me' });
      expect(dueMine.tasks.map((task) => task.id)).toEqual([seeded.aliceLoose.id]);

      const listsEveryone = await alice.listWorkLists();
      expect(
        listsEveryone.lists.map((list) => [list.id, list.name, list.openTaskCount])
      ).toEqual([
        [seeded.chores.id, 'Chores', 1],
        [seeded.empty.id, 'Empty', 0],
        [seeded.weekend.id, 'Weekend', 2],
      ]);
      expect(listsEveryone.unlisted.openTaskCount).toBe(7);
      expect(listsEveryone.total).toBe(3);
    });

    it('keeps a completed next action out of Due and brings a waiting project back when activated', async () => {
      const seeded = await seedNow(alice, bot);
      await alice.completeTask(seeded.alphaNa.id);

      const next = await alice.listNowNextActions({ owner: 'all' });
      expect(next.items.map((item) => item.task.id)).toEqual([
        seeded.bravoNa.id,
        seeded.charlieNa.id,
        seeded.deltaNa.id,
      ]);

      const due = await alice.listNowDue({ owner: 'all' });
      expect(due.tasks.map((task) => task.id)).toEqual([
        seeded.aliceLoose.id,
        seeded.echoNa.id,
        seeded.leftover.id,
      ]);

      await alice.changeProjectStatus(seeded.echo.id, { status: 'active' });
      const afterActive = await alice.listNowNextActions({ owner: 'all' });
      expect(afterActive.items.map((item) => item.task.id)).toEqual([
        seeded.echoNa.id,
        seeded.bravoNa.id,
        seeded.charlieNa.id,
        seeded.deltaNa.id,
      ]);
      const dueAfter = await alice.listNowDue({ owner: 'all' });
      expect(dueAfter.tasks.map((task) => task.id)).toEqual([
        seeded.aliceLoose.id,
        seeded.leftover.id,
      ]);
    });

    it('uses Pacific/Kiritimati and Pacific/Pago_Pago so the two zones disagree by a day', async () => {
      const calendarToday = (timeZone: string): string => {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(new Date());
        const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
        const month = parts.find((part) => part.type === 'month')?.value ?? '01';
        const day = parts.find((part) => part.type === 'day')?.value ?? '01';
        return `${year}-${month}-${day}`;
      };
      const kiritimati = calendarToday('Pacific/Kiritimati');
      const pagoPago = calendarToday('Pacific/Pago_Pago');
      expect(kiritimati).not.toBe(pagoPago);

      await alice.createTask({ title: 'Kiritimati today', dueDate: kiritimati });
      await alice.createTask({ title: 'Pago Pago today', dueDate: pagoPago });

      const kiritimatiToday = await alice.listTasks('today', {
        timeZone: 'Pacific/Kiritimati',
      });
      expect(kiritimatiToday.map((task) => task.title)).toEqual([
        'Pago Pago today',
        'Kiritimati today',
      ]);

      const pagoToday = await alice.listTasks('today', { timeZone: 'Pacific/Pago_Pago' });
      expect(pagoToday.map((task) => task.title)).toEqual(['Pago Pago today']);

      const kiritimatiDue = await alice.listNowDue({ timeZone: 'Pacific/Kiritimati' });
      expect(kiritimatiDue.tasks.map((task) => task.title)).toEqual([
        'Pago Pago today',
        'Kiritimati today',
      ]);

      const pagoDue = await alice.listNowDue({ timeZone: 'Pacific/Pago_Pago' });
      expect(pagoDue.tasks.map((task) => task.title)).toEqual(['Pago Pago today']);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Work Now screen [${ctx.driverName}]`, () => {
    let alice: BrowserActor;
    let bot: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-144-work-ui@example.com');
      bot = await mintBot(alice, ctx, 'Lane');
    });

    it('shows everyone’s Next actions and Due, then Mine, then What’s next', async () => {
      const seeded = await seedNow(alice, bot);

      await alice.useDesktopViewport();
      await alice.openWork();
      await alice.shouldSeeNowReady('all');
      await alice.shouldSeeNowMinePressed(false);
      await alice.shouldSeeNowSubcopy(nowSubcopyFor(4, 3));
      await alice.shouldSeeNowNextActionRows([
        { title: 'Alpha next', project: 'Alpha', owner: '' },
        { title: 'Bravo next', project: 'Bravo', owner: '' },
        { title: 'Charlie next', project: 'Charlie', owner: '' },
        { title: 'Delta next', project: 'Delta', owner: 'Lane' },
      ]);
      await alice.shouldSeeNowDueRows([
        { title: 'Alice overdue loose', owner: '' },
        { title: 'Echo waiting next', owner: '' },
        { title: 'Golf leftover', owner: '' },
      ]);
      await alice.shouldSeeRailItems([
        'Inbox',
        'Now',
        'Today',
        'Upcoming',
        'Mine',
        'Done',
        'Chores',
        'Empty',
        'Weekend',
        'Unlisted',
        'New list',
        'Alpha',
        'Bravo',
        'Charlie',
        'Delta',
        'Echo',
        'Golf',
        'New project',
      ]);
      await alice.shouldSeeRailListCount(seeded.chores.id, 1);
      await alice.shouldSeeRailListCount(seeded.empty.id, 0);
      await alice.shouldSeeRailListCount(seeded.weekend.id, 2);
      await alice.shouldSeeRailListCount('unlisted', 7);
      await alice.shouldSeeRailLabelOnOneLine('Weekend');

      await alice.toggleNowMine();
      await alice.shouldSeeNowReady('me');
      await alice.shouldSeeNowMinePressed(true);
      await alice.shouldSeeNowSubcopy(nowSubcopyFor(1, 1));
      await alice.shouldSeeNowNextActionRows([
        { title: 'Alpha next', project: 'Alpha', owner: '' },
      ]);
      await alice.shouldSeeNowDueRows([{ title: 'Alice overdue loose', owner: '' }]);
      await alice.shouldSeeRailListCount(seeded.chores.id, 1);
      await alice.shouldSeeRailListCount(seeded.weekend.id, 2);
      await alice.shouldSeeRailListCount('unlisted', 7);

      await alice.toggleNowMine();
      await alice.shouldSeeNowReady('all');
      await alice.shouldSeeNowMinePressed(false);
      await alice.shouldSeeNowNextActionRows([
        { title: 'Alpha next', project: 'Alpha', owner: '' },
        { title: 'Bravo next', project: 'Bravo', owner: '' },
        { title: 'Charlie next', project: 'Charlie', owner: '' },
        { title: 'Delta next', project: 'Delta', owner: 'Lane' },
      ]);

      await alice.completeOpenTaskFromRow(seeded.alphaNa.id);
      await alice.shouldSeeWhatsNext();
      await alice.shouldSeeNowNextActionRows([
        { title: 'Bravo next', project: 'Bravo', owner: '' },
        { title: 'Charlie next', project: 'Charlie', owner: '' },
        { title: 'Delta next', project: 'Delta', owner: 'Lane' },
      ]);
    }, 90_000);

    it('opens Work from the phone Work tab and lists named lists then Unlisted', async () => {
      const seeded = await seedNow(alice, bot);

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('work');
      await alice.shouldSeeNowReady('all');
      await alice.shouldSeeNowNextActionRows([
        { title: 'Alpha next', project: 'Alpha', owner: '' },
        { title: 'Bravo next', project: 'Bravo', owner: '' },
        { title: 'Charlie next', project: 'Charlie', owner: '' },
        { title: 'Delta next', project: 'Delta', owner: 'Lane' },
      ]);

      await alice.openNowListsSheet();
      await alice.shouldSeeNowListRows([
        { id: seeded.chores.id, name: 'Chores', count: 1 },
        { id: seeded.empty.id, name: 'Empty', count: 0 },
        { id: seeded.weekend.id, name: 'Weekend', count: 2 },
        { id: 'unlisted', name: 'Unlisted', count: 7 },
      ]);
      await alice.pickNowList(seeded.chores.id);
      await alice.shouldBeOnAllNamedPile(seeded.chores.id);
      await alice.shouldSeeOpenTasksInOrder(['Alpha next']);
    }, 90_000);

    it('resets Mine on every desktop visit: Today then back to Now', async () => {
      await seedNow(alice, bot);
      await alice.useDesktopViewport();
      await alice.openWork();
      await alice.toggleNowMine();
      await alice.shouldSeeNowMinePressed(true);
      await alice.openRailSmartView('today');
      await alice.openRailNow();
      await alice.shouldSeeNowReady('all');
      await alice.shouldSeeNowMinePressed(false);
    });

    it('resets Mine on every phone visit: Capture then Work', async () => {
      await seedNow(alice, bot);
      await alice.useMobileViewport();
      await alice.openWork();
      await alice.toggleNowMine();
      await alice.shouldSeeNowMinePressed(true);
      await alice.openMobileBottomTab('capture');
      await alice.openMobileBottomTab('work');
      await alice.shouldSeeNowReady('all');
      await alice.shouldSeeNowMinePressed(false);
    });

    it('shows an empty Now card when there is nothing due or next', async () => {
      await alice.useDesktopViewport();
      await alice.openWork();
      await alice.shouldSeeNowReady('all');
      await alice.shouldSeeNowEmpty();
      await alice.shouldSeeNowSubcopy(nowSubcopyFor(0, 0));
    });

    it('picks up a bot-set next action on the live poll', async () => {
      await alice.useDesktopViewport();
      await alice.openWork();
      await alice.useShortLiveQueryInterval(250);
      await alice.shouldSeeNowReady('all');
      await alice.shouldSeeNowEmpty();

      const harbor = await alice.createProject({ name: 'Harbor' });
      const paint = await alice.createTask({
        title: 'Paint the door',
        projectId: harbor.id,
        assigneeId: bot.userId,
      });
      const pending = alice.awaitLiveNowNextActions(
        (items) =>
          items.length === 1 &&
          items[0]?.title === 'Paint the door' &&
          items[0]?.project === 'Harbor'
      );
      await bot.setNextAction(harbor.id, { taskId: paint.id });
      await pending;
      await alice.shouldSeeNowNextActionRows([
        { title: 'Paint the door', project: 'Harbor', owner: 'Lane' },
      ]);
    }, 60_000);

    it('saves phone and desktop walkthrough shots of the required Now states', async () => {
      const seeded = await seedNow(alice, bot);

      await alice.useDesktopViewport();
      await alice.openWork();
      await alice.shouldSeeNowReady('all');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_everyone',
      });
      await alice.scrollNowDueClearOfTabBar();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_everyone_due',
      });
      await alice.openWork();
      await alice.shouldSeeNowReady('all');
      await alice.shouldSeeRailListCount(seeded.chores.id, 1);
      await alice.toggleNowMine();
      await alice.shouldSeeNowReady('me');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_mine',
      });
      await alice.toggleNowMine();
      await alice.useAppearance({ mode: 'dark', colorTheme: 'default' });
      await alice.openWork();
      await alice.shouldSeeNowReady('all');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_everyone_dark',
      });
      await alice.useAppearance({ mode: 'light', colorTheme: 'tokyo-night' });
      await alice.openWork();
      await alice.shouldSeeNowReady('all');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_everyone_tokyo_night',
      });
      await alice.useAppearance({ mode: 'light', colorTheme: 'default' });
      await alice.openWork();
      await alice.shouldSeeNowReady('all');

      await alice.useMobileViewport();
      await alice.openWork();
      await alice.shouldSeeNowReady('all');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_everyone',
      });
      await alice.scrollNowDueClearOfTabBar();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_everyone_due',
      });
      await alice.toggleNowMine();
      await alice.shouldSeeNowReady('me');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_mine',
      });
      await alice.toggleNowMine();
      await alice.shouldSeeNowReady('all');
      await alice.shouldSeeNowNextActionRows([
        { title: 'Alpha next', project: 'Alpha', owner: '' },
        { title: 'Bravo next', project: 'Bravo', owner: '' },
        { title: 'Charlie next', project: 'Charlie', owner: '' },
        { title: 'Delta next', project: 'Delta', owner: 'Lane' },
      ]);
      await alice.shouldSeeNowDueRows([
        { title: 'Alice overdue loose', owner: '' },
        { title: 'Echo waiting next', owner: '' },
        { title: 'Golf leftover', owner: '' },
      ]);
      await alice.openNowListsSheet();
      await alice.shouldSeeNowListRows([
        { id: seeded.chores.id, name: 'Chores', count: 1 },
        { id: seeded.empty.id, name: 'Empty', count: 0 },
        { id: seeded.weekend.id, name: 'Weekend', count: 2 },
        { id: 'unlisted', name: 'Unlisted', count: 7 },
      ]);
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'lists_sheet_open',
      });
      await alice.pickNowList(seeded.chores.id);
      await alice.shouldBeOnAllNamedPile(seeded.chores.id);
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'list_picked',
      });

      await alice.useDesktopViewport();
      await alice.openWork();
      await alice.completeOpenTaskFromRow(seeded.bravoNa.id);
      await alice.shouldSeeWhatsNext();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_completed_whats_next',
      });
      await alice.skipWhatsNext();

      const emptyDesktop = await ctx.createActor('alice-144-work-empty-desktop@example.com');
      await emptyDesktop.useDesktopViewport();
      await emptyDesktop.openWork();
      await emptyDesktop.shouldSeeNowEmpty();
      await emptyDesktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_empty',
      });

      const phoneWhatsNext = await ctx.createActor('alice-144-work-whats-next-phone@example.com');
      const phoneBot = await mintBot(phoneWhatsNext, ctx, 'Lane');
      const phoneSeed = await seedNow(phoneWhatsNext, phoneBot);
      await phoneWhatsNext.useMobileViewport();
      await phoneWhatsNext.openWork();
      await phoneWhatsNext.shouldSeeNowReady('all');
      await phoneWhatsNext.completeOpenTaskFromRow(phoneSeed.alphaNa.id);
      await phoneWhatsNext.shouldSeeWhatsNext();
      await phoneWhatsNext.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_completed_whats_next',
      });

      const empty = await ctx.createActor('alice-144-work-empty-phone@example.com');
      await empty.useMobileViewport();
      await empty.openWork();
      await empty.shouldSeeNowEmpty();
      await empty.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'now_empty',
      });
    }, 180_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Work Now screen — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs Now UI operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-144-work-http-stubs@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.openWork()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.openRailNow()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.toggleNowMine()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeNowReady('all')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.openNowListsSheet()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeRailLabelOnOneLine('Weekend')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.scrollNowDueClearOfTabBar()).rejects.toThrow(UnsupportedOperationError);
    });
  });
});
