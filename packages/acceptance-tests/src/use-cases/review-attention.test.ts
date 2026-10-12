import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';

/**
 * Projects plan story 13 (#145): Review: projects that need attention.
 *
 * Polly lock: waiting always listed; waiting + no next stays in Waiting
 * with a No next action chip; listed once with all reasons; last change
 * includes change_log; quiet from day 7 in the viewer zone; Review
 * replaces /projects with All projects collapsed below; inline actions
 * invalidate ['review'] with Undo; badge = active-no-next + quiet.
 */

const WALKTHROUGH_STORY = '145-review-attention';
const DESKTOP_1440 = { width: 1440, height: 900 } as const;

const dateOffset = (today: string, days: number): string => {
  const [year, month, day] = today.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return next.toISOString().slice(0, 10);
};

const dayLabel = (days: number): string => (days === 1 ? '1 day' : `${days} days`);

const formatMonthDay = (date: string): string =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${date}T00:00:00`)
  );

const formatLastChange = (lastChangeAt: string, daysSinceChange: number, timeZone: string): string => {
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(new Date(lastChangeAt));
  return `Last change ${label} · ${dayLabel(daysSinceChange)}`;
};

const viewerToday = (): string => {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const seedReview = async (alice: CoreActor) => {
  const today = viewerToday();
  const waitingSince = dateOffset(today, -19);
  const waitingToday = today;

  const house = await alice.createProject({ name: 'House storage' });

  const quiet = await alice.createProject({ name: 'Quiet garden' });
  const quietTask = await alice.createTask({
    title: 'Water plants',
    projectId: quiet.id,
  });
  await alice.setNextAction(quiet.id, { taskId: quietTask.id });
  await alice.backdateReviewProject(quiet.id, `${dateOffset(today, -8)}T17:00:00.000Z`);

  const fresh = await alice.createProject({ name: 'Fresh edit' });
  const freshTask = await alice.createTask({
    title: 'Fresh next',
    projectId: fresh.id,
  });
  await alice.setNextAction(fresh.id, { taskId: freshTask.id });
  await alice.updateTask(freshTask.id, { title: 'Fresh next edited' });

  const trusts = await alice.createProject({ name: 'Trusts' });
  const trustsTask = await alice.createTask({
    title: 'Call Mike',
    projectId: trusts.id,
  });
  await alice.setNextAction(trusts.id, { taskId: trustsTask.id });
  await alice.changeProjectStatus(trusts.id, {
    status: 'waiting',
    waitingOn: 'Mike',
    waitingSince,
  });

  const otherMike = await alice.createProject({ name: 'Other Mike' });
  await alice.changeProjectStatus(otherMike.id, {
    status: 'waiting',
    waitingOn: 'Mike',
    waitingSince: waitingToday,
  });

  const boat = await alice.createProject({ name: 'Boat' });
  const boatTask = await alice.createTask({
    title: 'Invoice Seabrook',
    projectId: boat.id,
  });
  await alice.setNextAction(boat.id, { taskId: boatTask.id });
  await alice.changeProjectStatus(boat.id, {
    status: 'waiting',
    waitingOn: 'Seabrook',
    waitingSince,
  });

  const unknown = await alice.createProject({ name: 'Unknown wait' });
  await alice.changeProjectStatus(unknown.id, {
    status: 'waiting',
    waitingOn: 'Pat',
  });

  const umbrella = await alice.createProject({ name: 'Umbrella' });
  await alice.changeProjectStatus(umbrella.id, { status: 'someday' });

  return { today, waitingSince, house, quiet, fresh, trusts, otherMike, boat, unknown };
};

usingDrivers(['http'] as const, (ctx) => {
  describe(`Review API [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let bot: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-145-review-http@example.com');
      bot = await mintBot(alice, ctx, 'ReviewBot');
    });

    it('returns the same attention list for a person and a bot', async () => {
      await seedReview(alice);

      const person = await alice.listReview({ timeZone: 'America/Chicago' });
      const agent = await bot.listReview({ timeZone: 'America/Chicago' });

      expect(person.projects.map((item) => item.project.name)).toEqual(
        agent.projects.map((item) => item.project.name)
      );
      expect(person.projects.map((item) => item.project.name)).toContain('House storage');
      expect(person.projects.map((item) => item.project.name)).toContain('Quiet garden');
      expect(person.projects.map((item) => item.project.name)).toContain('Trusts');
      expect(person.projects.map((item) => item.project.name)).not.toContain('Fresh edit');
      expect(person.projects.map((item) => item.project.name)).not.toContain('Umbrella');
      expect(person.counts.noNextAction).toBe(1);
      expect(person.counts.quiet).toBe(1);
      expect(person.counts.waiting).toBe(4);
      expect(person.hasMore).toBe(false);
      expect(person.total).toBe(person.projects.length);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Review screen [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-145-review-ui@example.com');
    });

    it('shows the three sections, grouped waiting, and hides Fresh edit and Umbrella', async () => {
      const seeded = await seedReview(alice);
      await alice.useMobileViewport();
      await alice.openReview();
      await alice.shouldSeeReviewReady();
      await alice.shouldSeeReviewSection('noNextAction');
      await alice.shouldSeeReviewSection('quiet');
      await alice.shouldSeeReviewSection('waiting');
      await alice.shouldSeeReviewItem({
        name: 'House storage',
        section: 'noNextAction',
        reasons: 'noNextAction',
      });
      await alice.shouldSeeReviewItem({
        name: 'Quiet garden',
        section: 'quiet',
        reasons: 'quiet',
      });
      await alice.shouldNotSeeReviewItem('Fresh edit');
      await alice.shouldNotSeeReviewItem('Umbrella');
      await alice.shouldSeeReviewWaitingGroup({ label: 'Mike', names: ['Trusts', 'Other Mike'] });
      await alice.shouldSeeReviewRowCopy(
        'Trusts',
        `Since ${formatMonthDay(seeded.waitingSince)} · 19 days`
      );
      await alice.shouldSeeReviewRowCopy('Other Mike', 'Since today');
      await alice.shouldSeeReviewRowCopy('Unknown wait', 'Waiting');
      const listed = await alice.listReview();
      const quiet = listed.projects.find((item) => item.project.name === 'Quiet garden');
      expect(quiet).toBeDefined();
      if (quiet) {
        await alice.shouldSeeReviewRowCopy(
          'Quiet garden',
          formatLastChange(quiet.lastChangeAt, quiet.daysSinceChange, Intl.DateTimeFormat().resolvedOptions().timeZone)
        );
      }
      await alice.shouldSeeReviewBadge(2);
    }, 90_000);

    it('sets a next action inline, stays on Review, and offers Undo', async () => {
      const seeded = await seedReview(alice);
      await alice.useMobileViewport();
      await alice.openReview();
      await alice.setReviewNextAction({ projectName: 'House storage', title: 'Box the attic' });
      await alice.shouldNotSeeReviewItem('House storage');
      await alice.shouldSeeUndoToast('Next action saved');
      const created = await alice.listOpenTasksOnProject(seeded.house.id);
      expect(created.map((task) => task.title)).toContain('Box the attic');
      const undo = await alice.undoReviewNextActionFromToast('Next action saved');
      expect(undo.requestBody, JSON.stringify(undo)).toEqual({ taskId: null });
      expect(undo.status).toBe(200);
      expect(undo.deletedUrl, JSON.stringify(undo)).toMatch(/\/api\/tasks\//);
      expect(undo.deletedStatus, JSON.stringify(undo)).toBe(204);
      await alice.shouldSeeReviewItem({
        name: 'House storage',
        section: 'noNextAction',
        reasons: 'noNextAction',
      });
      const afterUndo = await alice.listOpenTasksOnProject(seeded.house.id);
      expect(afterUndo.map((task) => task.title), JSON.stringify(undo)).not.toContain(
        'Box the attic'
      );
      await alice.expandAllProjects();
      await alice.shouldSeeProjectOnAllProjects({ name: 'House storage', status: 'active' });
    }, 90_000);

    it('restores the earlier next action on Undo without a second saved toast', async () => {
      const seeded = await seedReview(alice);
      const prior = await alice.getProject(seeded.quiet.id);
      expect(prior.nextActionTaskId).toBeTruthy();
      await alice.useMobileViewport();
      await alice.openReview();
      await alice.setReviewNextAction({ projectName: 'Quiet garden', title: 'Mulch the beds' });
      await alice.shouldSeeUndoToast('Next action saved');
      const created = await alice.listOpenTasksOnProject(seeded.quiet.id);
      expect(created.map((task) => task.title)).toContain('Water plants');
      expect(created.map((task) => task.title)).toContain('Mulch the beds');
      const undo = await alice.undoReviewNextActionFromToast('Next action saved');
      expect(undo.requestBody, JSON.stringify(undo)).toEqual({ taskId: prior.nextActionTaskId });
      expect(undo.status).toBe(200);
      expect(undo.deletedUrl, JSON.stringify(undo)).toMatch(/\/api\/tasks\//);
      expect(undo.deletedStatus, JSON.stringify(undo)).toBe(204);
      expect(undo.savedToastReappeared, JSON.stringify(undo)).toBe(false);
      await alice.shouldNotSeeToast('Next action saved');
      const after = await alice.getProject(seeded.quiet.id);
      expect(after.nextActionTaskId).toBe(prior.nextActionTaskId);
      const afterUndo = await alice.listOpenTasksOnProject(seeded.quiet.id);
      expect(afterUndo.map((task) => task.title)).toContain('Water plants');
      expect(afterUndo.map((task) => task.title)).not.toContain('Mulch the beds');
    }, 90_000);

    it('moves a quiet project to Waiting under the right group', async () => {
      const seeded = await seedReview(alice);
      await alice.useMobileViewport();
      await alice.openReview();
      await alice.changeReviewStatusToWaiting({
        projectName: 'Quiet garden',
        waitingOn: 'Mike',
        waitingSince: seeded.today,
      });
      await alice.shouldSeeReviewWaitingGroup({
        label: 'Mike',
        names: ['Trusts', 'Other Mike', 'Quiet garden'],
      });
      await alice.shouldSeeUndoToast('Project status saved');
      await alice.shouldSeeReviewItem({
        name: 'Quiet garden',
        section: 'waiting',
        reasons: 'waiting',
      });
    }, 90_000);

    it('keeps All projects and + New project below the sections', async () => {
      await seedReview(alice);
      await alice.useMobileViewport();
      await alice.openReview();
      await alice.shouldSeeReviewNewProject();
      await alice.expandAllProjects();
      await alice.shouldSeeProjectOnAllProjects({ name: 'House storage', status: 'active' });
      await alice.shouldSeeProjectOnAllProjects({ name: 'Fresh edit', status: 'active' });
      await alice.shouldSeeProjectOnAllProjects({ name: 'Umbrella', status: 'someday' });
      await alice.openProjectFromIndex('Fresh edit');
      await alice.shouldSeeProjectPage({ name: 'Fresh edit', status: 'active' });
    }, 90_000);

    it('shows the empty copy when nothing qualifies', async () => {
      await alice.useMobileViewport();
      await alice.openReview();
      await alice.shouldSeeReviewEmpty();
      await alice.shouldSeeReviewSubcopy('0 need attention');
      await alice.shouldNotSeeReviewBadge();
    }, 60_000);

    it('shows the same sections on desktop with Review lit', async () => {
      await seedReview(alice);
      await alice.useDesktopViewport(DESKTOP_1440);
      await alice.openReview();
      await alice.shouldSeeReviewSection('noNextAction');
      await alice.shouldSeeReviewSection('quiet');
      await alice.shouldSeeReviewSection('waiting');
      await alice.shouldSeeRailSectionHighlighted('review');
      await alice.shouldSeeReviewBadge(2);
    }, 90_000);

    it('records walkthrough screenshots on phone and desktop', async () => {
      const seeded = await seedReview(alice);

      await alice.useMobileViewport();
      await alice.openReview();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_sections',
      });
      await alice.shouldSeeReviewWaitingGroup({
        label: 'Mike',
        names: ['Trusts', 'Other Mike'],
      });
      await alice.scrollReviewWaitingIntoView();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_waiting_groups',
      });
      await alice.useAppearance({ mode: 'dark', colorTheme: 'default' });
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_sections_dark',
      });
      await alice.useAppearance({ mode: 'light', colorTheme: 'default' });
      await alice.openReviewSetNextAction('House storage');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_set_next_action_sheet',
      });
      await alice.setReviewNextAction({ projectName: 'House storage', title: 'Box the attic' });
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_after_action',
        includeToasts: true,
      });
      await alice.openReviewChangeStatus('Quiet garden');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_change_status_sheet',
      });
      await alice.changeReviewStatusToWaiting({
        projectName: 'Quiet garden',
        waitingOn: 'Mike',
        waitingSince: seeded.today,
      });
      await alice.expandAllProjects();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_all_projects_open',
      });

      const desktop = await ctx.createActor('alice-145-review-desktop@example.com');
      await seedReview(desktop);
      await desktop.useDesktopViewport(DESKTOP_1440);
      await desktop.openReview();
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_sections',
      });
      await desktop.shouldSeeReviewWaitingGroup({
        label: 'Mike',
        names: ['Trusts', 'Other Mike'],
      });
      await desktop.scrollReviewWaitingIntoView();
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_waiting_groups',
      });
      await desktop.openReviewSetNextAction('House storage');
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_set_next_action_sheet',
      });
      await desktop.setReviewNextAction({
        projectName: 'House storage',
        title: 'Box the attic',
      });
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_after_action',
        includeToasts: true,
      });
      await desktop.openReviewChangeStatus('Quiet garden');
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_change_status_sheet',
      });
      await desktop.openReview();
      await desktop.expandAllProjects();
      await desktop.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_all_projects_open',
      });

      const empty = await ctx.createActor('alice-145-review-empty@example.com');
      await empty.useMobileViewport();
      await empty.openReview();
      await empty.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_empty',
      });
      await empty.useDesktopViewport(DESKTOP_1440);
      await empty.openReview();
      await empty.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_empty',
      });
    }, 180_000);
  });
});
