import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';

/**
 * Projects plan story 14 (#146): Review: done list.
 *
 * Polly lock: current completed_at in the stored-zone Monday–Sunday week;
 * project-less tasks are a count line that links to Done; one Set next
 * action per active/waiting group with none; week stepper via ?doneWeek=.
 */

const WALKTHROUGH_STORY = '146-review-done-list';
const DESKTOP_1440 = { width: 1440, height: 900 } as const;
const TIME_ZONE = 'America/Chicago';

const calendarParts = (now: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
};

const addDays = (date: string, days: number): string => {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
};

const mondayOnOrBefore = (date: string): string => {
  const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(date, offset);
};

const zoneParts = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
};

const localDateTimeUtc = (
  date: string,
  timeZone: string,
  hour: number,
  minute: number
): string => {
  const [year, month, day] = date.split('-').map(Number);
  const wanted = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour, minute, 0);
  let utcMs = wanted;
  const shown1 = zoneParts(new Date(utcMs), timeZone);
  utcMs +=
    wanted -
    Date.UTC(shown1.year, shown1.month - 1, shown1.day, shown1.hour, shown1.minute, shown1.second);
  const shown2 = zoneParts(new Date(utcMs), timeZone);
  utcMs +=
    wanted -
    Date.UTC(shown2.year, shown2.month - 1, shown2.day, shown2.hour, shown2.minute, shown2.second);
  return new Date(utcMs).toISOString();
};

const formatWhen = (completedAt: string, name?: string): string => {
  const instant = new Date(completedAt);
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: TIME_ZONE,
  }).format(instant);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIME_ZONE,
  })
    .format(instant)
    .replace(/\s/g, '')
    .toLowerCase();
  return name ? `${weekday} ${time} · ${name}` : `${weekday} ${time}`;
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

const seedDone = async (alice: CoreActor) => {
  const today = calendarParts(new Date(), TIME_ZONE);
  const thisMonday = mondayOnOrBefore(today);
  const lastMonday = addDays(thisMonday, -7);
  const emptyMonday = addDays(thisMonday, -14);
  const houseAt = localDateTimeUtc(thisMonday, TIME_ZONE, 15, 12);
  const gardenAt = localDateTimeUtc(thisMonday, TIME_ZONE, 17, 0);
  const lastWeekAt = localDateTimeUtc(addDays(lastMonday, 3), TIME_ZONE, 11, 0);
  const otherAt = localDateTimeUtc(thisMonday, TIME_ZONE, 16, 0);

  const house = await alice.createProject({ name: 'House storage' });
  const houseTask = await alice.createTask({ title: 'Box the attic', projectId: house.id });
  await alice.completeTask(houseTask.id);
  await alice.finishTaskAt(houseTask.id, houseAt);

  const garden = await alice.createProject({ name: 'Garden' });
  const gardenTask = await alice.createTask({ title: 'Plant tomatoes', projectId: garden.id });
  const gardenNext = await alice.createTask({ title: 'Water plants', projectId: garden.id });
  await alice.setNextAction(garden.id, { taskId: gardenNext.id });
  await alice.completeTask(gardenTask.id);
  await alice.finishTaskAt(gardenTask.id, gardenAt);

  const shed = await alice.createProject({ name: 'Old shed' });
  const shedTask = await alice.createTask({ title: 'Sweep the floor', projectId: shed.id });
  await alice.completeTask(shedTask.id);
  await alice.finishTaskAt(shedTask.id, lastWeekAt);

  const loose = await alice.createTask({ title: 'Milk' });
  await alice.completeTask(loose.id);
  await alice.finishTaskAt(loose.id, otherAt);

  const reopened = await alice.createTask({ title: 'Undo me', projectId: house.id });
  await alice.completeTask(reopened.id);
  await alice.uncompleteTask(reopened.id);

  return {
    thisMonday,
    lastMonday,
    emptyMonday,
    house,
    garden,
    shed,
    houseAt,
    gardenAt,
    lastWeekAt,
  };
};

usingDrivers(['http'] as const, (ctx) => {
  describe(`Done list API [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let bot: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-146-done-http@example.com');
      bot = await mintBot(alice, ctx, 'DoneBot');
    });

    it('returns the same groups for a person and a bot', async () => {
      const seeded = await seedDone(alice);
      const person = await alice.listDone();
      const agent = await bot.listDone();

      expect(person.week.start).toBe(seeded.thisMonday);
      expect(person.timeZone).toBe(TIME_ZONE);
      expect(person.groups.map((group) => group.project.name)).toEqual(['Garden', 'House storage']);
      expect(person.groups[0]?.tasks.map((task) => task.title)).toEqual(['Plant tomatoes']);
      expect(person.groups[1]?.tasks.map((task) => task.title)).toEqual(['Box the attic']);
      expect(person.groups.some((group) => group.tasks.some((task) => task.title === 'Undo me'))).toBe(
        false
      );
      expect(person.otherTaskCount).toBe(1);
      expect(agent.groups).toEqual(person.groups);
      expect(agent.otherTaskCount).toBe(person.otherTaskCount);

      const lastWeek = await alice.listDone({ week: seeded.lastMonday });
      expect(lastWeek.groups.map((group) => group.project.name)).toEqual(['Old shed']);
      expect(lastWeek.otherTaskCount).toBe(0);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Done this week [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-146-done-ui@example.com');
    });

    it('shows both groups this week and the project-less count line', async () => {
      const seeded = await seedDone(alice);
      const listed = await alice.listDone();
      const houseName = listed.groups[1]?.tasks[0]?.completedByName;
      await alice.useMobileViewport();
      await alice.openReview();
      await alice.shouldSeeDoneWeek(seeded.thisMonday);
      await alice.shouldSeeDoneGroup({ name: 'Garden', titles: ['Plant tomatoes'] });
      await alice.shouldSeeDoneGroup({ name: 'House storage', titles: ['Box the attic'] });
      await alice.shouldSeeDoneNext({ projectName: 'Garden', title: 'Water plants' });
      await alice.shouldSeeDoneSetNext('House storage');
      await alice.shouldSeeDoneTaskWhen({
        projectName: 'House storage',
        title: 'Box the attic',
        copy: formatWhen(seeded.houseAt, houseName),
      });
      await alice.shouldSeeDoneOther('Plus 1 task not in a project');
    }, 90_000);

    it('sets a next action with Undo and restores the button', async () => {
      const seeded = await seedDone(alice);
      await alice.useMobileViewport();
      await alice.openReview();
      await alice.shouldSeeDoneWeek(seeded.thisMonday);
      await alice.setDoneNextAction({ projectName: 'House storage', title: 'Label the bins' });
      await alice.shouldSeeUndoToast('Next action saved');
      await alice.shouldSeeDoneNext({ projectName: 'House storage', title: 'Label the bins' });
      await alice.shouldNotSeeReviewItem('House storage');
      await alice.undoFromToast('Next action saved');
      await alice.shouldSeeReviewItem({
        name: 'House storage',
        section: 'noNextAction',
        reasons: 'noNextAction',
      });
      await alice.shouldSeeDoneSetNext('House storage');
    }, 90_000);

    it('steps to last week and back via the URL', async () => {
      const seeded = await seedDone(alice);
      await alice.useMobileViewport();
      await alice.openReview();
      await alice.shouldSeeDoneWeek(seeded.thisMonday);
      await alice.goToPreviousDoneWeek();
      await alice.shouldSeeDoneWeek(seeded.lastMonday);
      await alice.shouldSeeDoneGroup({ name: 'Old shed', titles: ['Sweep the floor'] });
      await alice.goToNextDoneWeek();
      await alice.shouldSeeDoneWeek(seeded.thisMonday);
      await alice.shouldSeeDoneGroup({ name: 'Garden', titles: ['Plant tomatoes'] });
    }, 90_000);

    it('shows the empty copy on a week with nothing', async () => {
      const seeded = await seedDone(alice);
      await alice.useMobileViewport();
      await alice.openReview();
      await alice.goToPreviousDoneWeek();
      await alice.goToPreviousDoneWeek();
      await alice.shouldSeeDoneWeek(seeded.emptyMonday);
      await alice.shouldSeeDoneEmpty();
    }, 90_000);

    it('shows the same groups on desktop with Review lit', async () => {
      const seeded = await seedDone(alice);
      await alice.useDesktopViewport(DESKTOP_1440);
      await alice.openReview();
      await alice.shouldSeeDoneWeek(seeded.thisMonday);
      await alice.shouldSeeDoneGroup({ name: 'Garden', titles: ['Plant tomatoes'] });
      await alice.shouldSeeDoneGroup({ name: 'House storage', titles: ['Box the attic'] });
      await alice.shouldSeeRailSectionHighlighted('review');
    }, 90_000);

    it('records walkthrough screenshots on phone and desktop', async () => {
      const seeded = await seedDone(alice);

      await alice.useMobileViewport();
      await alice.openReview();
      await alice.shouldSeeDoneWeek(seeded.thisMonday);
      await alice.scrollDoneIntoView();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_this_week',
      });
      await alice.useAppearance({ mode: 'dark', colorTheme: 'default' });
      await alice.scrollDoneIntoView();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_this_week_dark',
      });
      await alice.useAppearance({ mode: 'light', colorTheme: 'default' });
      await alice.openDoneSetNextAction('House storage');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_set_next_action_sheet',
      });
      await alice.setDoneNextAction({ projectName: 'House storage', title: 'Label the bins' });
      await alice.scrollDoneIntoView();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_after_action',
        includeToasts: true,
      });
      await alice.undoFromToast('Next action saved');
      await alice.goToPreviousDoneWeek();
      await alice.shouldSeeDoneWeek(seeded.lastMonday);
      await alice.scrollDoneIntoView();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_previous_week',
      });
      await alice.goToPreviousDoneWeek();
      await alice.shouldSeeDoneEmpty();
      await alice.scrollDoneIntoView();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_empty',
      });

      const desktop = await ctx.createActor('alice-146-done-desktop@example.com');
      await seedDone(desktop);
      await desktop.useDesktopViewport(DESKTOP_1440);
      await desktop.openReview();
      await desktop.shouldSeeDoneWeek(seeded.thisMonday);
      await desktop.scrollDoneIntoView();
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_this_week',
      });
      await desktop.openDoneSetNextAction('House storage');
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_set_next_action_sheet',
      });
      await desktop.setDoneNextAction({
        projectName: 'House storage',
        title: 'Label the bins',
      });
      await desktop.scrollDoneIntoView();
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_after_action',
        includeToasts: true,
      });
      await desktop.undoFromToast('Next action saved');
      await desktop.goToPreviousDoneWeek();
      await desktop.scrollDoneIntoView();
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_previous_week',
      });
      await desktop.goToPreviousDoneWeek();
      await desktop.shouldSeeDoneEmpty();
      await desktop.scrollDoneIntoView();
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'done_empty',
      });
    }, 180_000);
  });
});
