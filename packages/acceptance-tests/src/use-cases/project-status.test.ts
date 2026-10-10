import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';
import { ConflictError, ForbiddenError, ValidationError } from '@yoink/acceptance-testing';

/**
 * Story 5 (#136): Project status, including waiting.
 *
 * Status is active, waiting, someday, or done. Waiting needs who
 * (and optional since). Only a person can mark done or reopen.
 * Done with open tasks requires complete or remove.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Project status [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-project-status-http@example.com');
    });

    it('lets a bot set waiting and someday and refuses done and reopen', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const minted = await alice.mintAgent('Status bot');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const waiting = await bot.changeProjectStatus(garden.id, {
        status: 'waiting',
        waitingOn: 'Mike',
      });
      expect(waiting.project.status).toBe('waiting');
      expect(waiting.project.waitingOn).toBe('Mike');
      expect(waiting.project.waitingSince).toBeNull();

      const someday = await bot.changeProjectStatus(garden.id, { status: 'someday' });
      expect(someday.project.status).toBe('someday');
      expect(someday.project.waitingOn).toBeNull();

      await expect(bot.changeProjectStatus(garden.id, { status: 'done' })).rejects.toThrow(
        ForbiddenError
      );

      await alice.changeProjectStatus(garden.id, { status: 'done' });
      await expect(bot.changeProjectStatus(garden.id, { status: 'active' })).rejects.toThrow(
        ForbiddenError
      );
    });

    it('lets a bot edit waiting on an already-waiting project', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.changeProjectStatus(garden.id, {
        status: 'waiting',
        waitingOn: 'Mike',
        waitingSince: '2026-10-01',
      });
      const minted = await alice.mintAgent('Waiting editor');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const edited = await bot.changeProjectStatus(garden.id, {
        status: 'waiting',
        waitingOn: 'Trident',
        waitingSince: null,
      });
      expect(edited.project.waitingOn).toBe('Trident');
      expect(edited.project.waitingSince).toBeNull();
    });

    it('refuses waiting without who and done with open tasks and no choice', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await expect(alice.changeProjectStatus(garden.id, { status: 'waiting' })).rejects.toThrow(
        ValidationError
      );

      await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await expect(alice.changeProjectStatus(garden.id, { status: 'done' })).rejects.toThrow(
        ConflictError
      );
    });

    it('completes or removes open tasks when marking done', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const soil = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      const herbs = await alice.createTask({ title: 'Plant herbs', projectId: garden.id });

      const completed = await alice.changeProjectStatus(garden.id, {
        status: 'done',
        openTasks: 'complete',
      });
      expect(completed.completedTaskCount).toBe(2);
      expect((await alice.getTask(soil.id)).completedAt).toBeTruthy();
      expect((await alice.getTask(herbs.id)).projectId).toBe(garden.id);

      const cabin = await alice.createProject({ name: 'Cabin' });
      const nails = await alice.createTask({ title: 'Buy nails', projectId: cabin.id });
      const removed = await alice.changeProjectStatus(cabin.id, {
        status: 'done',
        openTasks: 'remove',
      });
      expect(removed.removedTaskCount).toBe(1);
      expect((await alice.getTask(nails.id)).projectId).toBeUndefined();
      expect((await alice.getTask(nails.id)).completedAt).toBeUndefined();
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Project status [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-project-status@example.com');
    });

    it('sets waiting with who and default today and shows days on the page', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.goToProject(garden.id);
      await alice.setProjectWaitingFromPage({ waitingOn: 'Mike' });
      await alice.shouldSeeWaitingSummary('Waiting on Mike');
      await alice.shouldSeeWaitingSummary('days');
      await alice.shouldSeeProjectPage({ name: 'Garden', status: 'waiting' });
    });

    it('moves a someday project into the rail Someday group', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.goToProject(garden.id);
      await alice.shouldSeeProjectOnRail('Garden');
      await alice.setProjectStatusFromPage('someday');
      await alice.openSomedayGroup();
      await alice.shouldSeeProjectInSomedayGroup('Garden');
    });

    it('marks done with open tasks by completing them', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.goToProject(garden.id);
      await alice.openProjectStatusSelect('Done');
      await alice.pageClickDoneOption();
      await alice.confirmDoneComplete();
      await alice.shouldSeeProjectPage({ name: 'Garden', status: 'done' });
      await alice.shouldNotSeeOpenTaskOnProject('Buy soil');
    });

    it('marks done with open tasks by taking them out', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.goToProject(garden.id);
      await alice.openProjectStatusSelect('Done');
      await alice.pageClickDoneOption();
      await alice.confirmDoneRemove();
      await alice.shouldSeeProjectPage({ name: 'Garden', status: 'done' });
      await alice.shouldNotSeeOpenTaskOnProject('Buy soil');
    });

    it('leaves the rail when done and still lists the project on All projects', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.goToProject(garden.id);
      await alice.setProjectStatusFromPage('done');
      await alice.shouldNotSeeProjectOnRail('Garden');
      await alice.goToAllProjects();
      await alice.shouldSeeProjectOnAllProjects({ name: 'Garden', status: 'done' });
    });

    it('reopens a done project', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.changeProjectStatus(garden.id, { status: 'done' });
      await alice.goToProject(garden.id);
      await alice.setProjectStatusFromPage('active');
      await alice.shouldSeeProjectPage({ name: 'Garden', status: 'active' });
      await alice.shouldSeeProjectOnRail('Garden');
    });

    it('shows Edit this task. in the edit-task dialog', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const task = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.openRailUnlisted();
      await alice.openTaskEditFromRow(task.id);
      await alice.shouldSeeEditTaskDialogSubtitle('Edit this task.');
    });
  });
});

const WALKTHROUGH_STORY = '136-project-status';

const walkthroughViewports = [
  {
    name: 'desktop' as const,
    apply: (actor: BrowserActor) => actor.useDesktopViewport(),
  },
  {
    name: 'phone' as const,
    apply: (actor: BrowserActor) => actor.useMobileViewport(),
  },
];

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`#136 walkthrough screenshots [${ctx.driverName}]`, () => {
    for (const viewport of walkthroughViewports) {
      it(`saves ${viewport.name} shots of status, waiting, someday, done, and edit`, async () => {
        const alice = await ctx.createActor(
          `alice-136-walkthrough-${viewport.name}@example.com`
        );
        await viewport.apply(alice);

        const garden = await alice.createProject({ name: 'Garden' });
        await alice.createTask({ title: 'Buy soil', projectId: garden.id });
        const cabin = await alice.createProject({ name: 'Cabin' });
        await alice.createTask({ title: 'Buy nails', projectId: cabin.id });

        await alice.goToProject(garden.id);
        await alice.openProjectStatusSelect('Waiting');
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'status_control_open',
        });
        await alice.dismissOpenSelect();

        await alice.openProjectStatusSelect('Waiting');
        await alice.pageClickWaitingOption();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'waiting_form_default_today',
        });
        await alice.setProjectWaitingFromPage({ waitingOn: 'Mike' });
        await alice.shouldSeeWaitingSummary('Waiting on Mike');
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'waiting_on_days',
        });

        await alice.setProjectStatusFromPage('someday');
        if (viewport.name === 'phone') {
          await alice.openMobileBottomTab('tasks');
          await alice.openMobileTasksRail();
        }
        await alice.openSomedayGroup();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'someday_group',
        });

        await alice.changeProjectStatus(garden.id, { status: 'active' });
        await alice.goToProject(garden.id);
        await alice.openProjectStatusSelect('Done');
        await alice.pageClickDoneOption();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'done_open_tasks_confirm',
        });
        await alice.confirmDoneComplete();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'done_complete',
        });

        await alice.goToProject(cabin.id);
        await alice.openProjectStatusSelect('Done');
        await alice.pageClickDoneOption();
        await alice.confirmDoneRemove();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'done_take_out',
        });

        await alice.goToAllProjects();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'all_projects_statuses',
        });

        const soil = await alice.createTask({ title: 'Mulch' });
        await alice.openRailUnlisted();
        await alice.openTaskEditFromRow(soil.id);
        await alice.shouldSeeEditTaskDialogSubtitle('Edit this task.');
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'edit_task_subtitle',
        });
      }, 90_000);
    }
  });
});
