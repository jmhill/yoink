import { usingDrivers, describe, it } from '@yoink/acceptance-testing';

/**
 * #212: On Work, Due is the first group on phone and desktop. Overdue
 * comes before due today. A due next action is listed once, under Due.
 * With nothing due, there is no Due heading. Header counts stay the
 * API totals (the due query still omits shown next actions).
 */

const WALKTHROUGH_STORY = 'work-due-first';

const calendarDate = (dayOffset: number): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '1970');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1');
  const shifted = new Date(Date.UTC(year, month - 1, day + dayOffset));
  const shiftedYear = String(shifted.getUTCFullYear()).padStart(4, '0');
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const shiftedDay = String(shifted.getUTCDate()).padStart(2, '0');
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
};

const nowSubcopyFor = (nextActionCount: number, dueCount: number): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const next = nextActionCount === 1 ? '1 next action' : `${nextActionCount} next actions`;
  const due = dueCount === 1 ? '1 due' : `${dueCount} due`;
  return `${weekday} ${month} ${day} · ${next} · ${due}`;
};

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Work due group is first [${ctx.driverName}]`, () => {
    it('shows overdue then due today under Due, once, on phone and desktop, and hides Due when nothing is due', async () => {
      const today = calendarDate(0);
      const overdueOn = calendarDate(-1);
      const alice = await ctx.createActor(`alice-212-due-${Date.now()}@example.com`);

      await alice.createTask({ title: 'Overdue loose', dueDate: overdueOn });
      const taxes = await alice.createProject({ name: 'Taxes' });
      const dueToday = await alice.createTask({
        title: 'Due today next',
        dueDate: today,
        projectId: taxes.id,
      });
      await alice.setNextAction(taxes.id, { taskId: dueToday.id });
      const home = await alice.createProject({ name: 'Home' });
      const plain = await alice.createTask({ title: 'Plain next', projectId: home.id });
      await alice.setNextAction(home.id, { taskId: plain.id });

      for (const viewport of ['phone', 'desktop'] as const) {
        if (viewport === 'phone') {
          await alice.useMobileViewport();
        } else {
          await alice.useDesktopViewport();
        }
        await alice.openWork();
        await alice.shouldSeeNowReady('all');
        await alice.shouldSeeNowSubcopy(nowSubcopyFor(2, 1));
        await alice.shouldSeeNowSections(['due', 'next-actions']);
        await alice.shouldSeeNowDueRows([
          { title: 'Overdue loose', owner: '' },
          { title: 'Due today next', owner: '' },
        ]);
        await alice.shouldSeeNowNextActionRows([
          { title: 'Plain next', project: 'Home', owner: '' },
        ]);
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'due_first',
        });
      }

      const quiet = await ctx.createActor(`alice-212-quiet-${Date.now()}@example.com`);
      const garden = await quiet.createProject({ name: 'Garden' });
      const onlyNext = await quiet.createTask({ title: 'Water the herbs', projectId: garden.id });
      await quiet.setNextAction(garden.id, { taskId: onlyNext.id });

      for (const viewport of ['phone', 'desktop'] as const) {
        if (viewport === 'phone') {
          await quiet.useMobileViewport();
        } else {
          await quiet.useDesktopViewport();
        }
        await quiet.openWork();
        await quiet.shouldSeeNowReady('all');
        await quiet.shouldSeeNowSubcopy(nowSubcopyFor(1, 0));
        await quiet.shouldSeeNowSections(['next-actions']);
        await quiet.shouldSeeNowNextActionRows([
          { title: 'Water the herbs', project: 'Garden', owner: '' },
        ]);
        await quiet.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'nothing_due',
        });
      }
    }, 120_000);
  });
});
