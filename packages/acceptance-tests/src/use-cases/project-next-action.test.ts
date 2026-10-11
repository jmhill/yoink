import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';

/**
 * Story 6 (#137): Next action, plus the approved project page.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Project next action [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-next-action-http@example.com');
    });

    it('lets a bot set, replace, and clear the next action', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const soil = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      const herbs = await alice.createTask({ title: 'Plant herbs', projectId: garden.id });
      const minted = await alice.mintAgent('Next-action bot');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const set = await bot.setNextAction(garden.id, { taskId: soil.id });
      expect(set.project.nextActionTaskId).toBe(soil.id);

      const replaced = await bot.setNextAction(garden.id, { taskId: herbs.id });
      expect(replaced.project.nextActionTaskId).toBe(herbs.id);

      const cleared = await bot.setNextAction(garden.id, { taskId: null });
      expect(cleared.project.nextActionTaskId).toBeNull();
    });

    it('clears the next action when a bot completes it', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const soil = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.setNextAction(garden.id, { taskId: soil.id });
      const minted = await alice.mintAgent('Completer');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      await bot.completeTask(soil.id);
      expect((await alice.getProject(garden.id)).nextActionTaskId).toBeNull();
    });

    it('does not restore a next action when the completed task is reopened', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const soil = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.setNextAction(garden.id, { taskId: soil.id });
      await alice.completeTask(soil.id);
      expect((await alice.getProject(garden.id)).nextActionTaskId).toBeNull();
      await alice.uncompleteTask(soil.id);
      expect((await alice.getProject(garden.id)).nextActionTaskId).toBeNull();
      const open = await alice.listOpenTasksOnProject(garden.id);
      expect(open.map((task) => task.id)).toContain(soil.id);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Project next action [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-next-action@example.com');
    });

    it('sets a next action from an open task and removes it from the open list', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.createTask({ title: 'Plant herbs', projectId: garden.id });
      await alice.goToProject(garden.id);
      await alice.openNextActionPicker();
      await alice.pickNextActionFromPicker('Buy soil');
      await alice.shouldSeeNextAction('Buy soil');
      await alice.shouldNotSeeOpenTaskOnProject('Buy soil');
      await alice.shouldSeeOpenTaskOnProject('Plant herbs');
    });

    it('replaces the next action', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const soil = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.createTask({ title: 'Plant herbs', projectId: garden.id });
      await alice.setNextAction(garden.id, { taskId: soil.id });
      await alice.goToProject(garden.id);
      await alice.openNextActionPicker();
      await alice.pickNextActionFromPicker('Plant herbs');
      await alice.shouldSeeNextAction('Plant herbs');
      await alice.shouldSeeOpenTaskOnProject('Buy soil');
    });

    it('creates a new task from the picker and makes it the next action', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.goToProject(garden.id);
      await alice.openNextActionPicker();
      await alice.createNextActionFromPicker('Order lumber');
      await alice.shouldSeeNextAction('Order lumber');
      await alice.shouldNotSeeOpenTaskOnProject('Order lumber');
    });

    for (const viewport of [
      { name: 'desktop' as const, apply: (actor: BrowserActor) => actor.useDesktopViewport() },
      { name: 'phone' as const, apply: (actor: BrowserActor) => actor.useMobileViewport() },
    ]) {
      it(`shows What’s next after completing the next action from Today on ${viewport.name}`, async () => {
        await viewport.apply(alice);
        const today = new Date().toISOString().split('T')[0]!;
        const garden = await alice.createProject({ name: 'Garden' });
        const soil = await alice.createTask({
          title: 'Buy soil',
          projectId: garden.id,
          dueDate: today,
        });
        await alice.setNextAction(garden.id, { taskId: soil.id });
        await alice.openToday();
        await alice.completeOpenTaskFromRow(soil.id);
        await alice.shouldSeeWhatsNext();
      });
    }

    it('shows What’s next after completing, then picks another', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const soil = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.createTask({ title: 'Plant herbs', projectId: garden.id });
      await alice.setNextAction(garden.id, { taskId: soil.id });
      await alice.goToProject(garden.id);
      await alice.completeNextActionFromPage('Buy soil');
      await alice.shouldSeeWhatsNext();
      await alice.pickWhatsNextTask('Plant herbs');
      await alice.shouldSeeNextAction('Plant herbs');
    });

    it('shows the no-next-action card after complete and Skip', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const soil = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.setNextAction(garden.id, { taskId: soil.id });
      await alice.goToProject(garden.id);
      await alice.completeNextActionFromPage('Buy soil');
      await alice.skipWhatsNext();
      await alice.shouldSeeNoNextActionCard();
    });

    it('shows the empty card after deleting the next action from Edit', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const soil = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.setNextAction(garden.id, { taskId: soil.id });
      await alice.goToProject(garden.id);
      await alice.openTaskEditFromRow(soil.id);
      await alice.deleteTaskFromEdit();
      await alice.shouldSeeNoNextActionCard();
    });

    it('shows the empty card after taking the next action out of the project', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const soil = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.setNextAction(garden.id, { taskId: soil.id });
      await alice.goToProject(garden.id);
      await alice.openTaskEditFromRow(soil.id);
      await alice.clearTaskProjectFromEdit();
      await alice.shouldSeeNoNextActionCard();
    });

    it('renames from Edit and shows the blank-name error', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.goToProject(garden.id);
      await alice.shouldSeeBlankProjectNameError();
      await alice.dismissProjectEditDialog();
      await alice.editProjectName('Backyard');
      await alice.shouldSeeProjectPage({ name: 'Backyard', status: 'active' });
    }, 45_000);

    it('uses a single status control and opens waiting only when chosen', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.goToProject(garden.id);
      await alice.shouldSeeSingleStatusControl();
      await alice.openProjectStatusSelect('Waiting');
      await alice.pageClickWaitingOption();
      await alice.setProjectWaitingFromPage({ waitingOn: 'Mike' });
      await alice.shouldSeeWaitingSummary('Waiting on Mike');
      await alice.shouldSeeWaitingSummary('days');
    });

    it('saves Don’t know as since unknown', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.goToProject(garden.id);
      await alice.setProjectWaitingFromPage({ waitingOn: 'Contractor', unknownSince: true });
      await alice.shouldSeeWaitingSummary('Waiting on Contractor');
      await alice.shouldSeeWaitingSummary('since unknown');
    });

    it('shows a plain Set next action link on someday, not the warning card', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      await alice.goToProject(garden.id);
      await alice.setProjectStatusFromPage('someday');
      await alice.shouldSeeSomedaySetNextActionLink();
      await alice.openNextActionPicker();
      await alice.pickNextActionFromPicker('Buy soil');
      await alice.shouldSeeNextAction('Buy soil');
    });

    it('keeps Skip and Create and set on screen when the phone picker overflows', async () => {
      await alice.useMobileViewport();
      const garden = await alice.createProject({ name: 'Garden' });
      const soil = await alice.createTask({ title: 'Buy soil', projectId: garden.id });
      for (let index = 1; index <= 12; index += 1) {
        await alice.createTask({ title: `Overflow task ${index}`, projectId: garden.id });
      }
      await alice.setNextAction(garden.id, { taskId: soil.id });
      await alice.goToProject(garden.id);
      await alice.openNextActionPicker();
      await alice.shouldSeePickerCreateInViewport();
      await alice.dismissNextActionPicker();
      await alice.completeNextActionFromPage('Buy soil');
      await alice.shouldSeeWhatsNext();
      await alice.shouldSeeWhatsNextFooterInViewport();
      await alice.skipWhatsNext();
      await alice.shouldSeeNoNextActionCard();
    }, 60_000);
  });
});

const WALKTHROUGH_STORY = '137-project-page';

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
  describe(`#137 walkthrough screenshots [${ctx.driverName}]`, () => {
    for (const viewport of walkthroughViewports) {
      it(`saves ${viewport.name} shots of the project page, picker, prompt, and waiting`, async () => {
        const alice = await ctx.createActor(
          `alice-137-walkthrough-${viewport.name}@example.com`
        );
        await viewport.apply(alice);

        const kitchen = await alice.createProject({
          name: 'Kitchen renovation',
          objective: 'New counters installed and kitchen usable',
        });
        const quotes = await alice.createTask({
          title: 'Get three contractor quotes',
          projectId: kitchen.id,
        });
        await alice.createTask({
          title: 'Measure the cabinet dimensions',
          projectId: kitchen.id,
        });
        await alice.createTask({ title: 'Order the sink and faucet', projectId: kitchen.id });
        await alice.setNextAction(kitchen.id, { taskId: quotes.id });

        await alice.goToProject(kitchen.id);
        await alice.shouldSeeNextAction('Get three contractor quotes');
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'next_action',
        });

        await alice.openNextActionPicker();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'picker_new_task',
        });
        await alice.createNextActionFromPicker('Pick the countertop material');
        await alice.shouldSeeNextAction('Pick the countertop material');

        await alice.completeNextActionFromPage('Pick the countertop material');
        await alice.shouldSeeWhatsNext();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'whats_next',
        });
        await alice.skipWhatsNext();
        await alice.shouldSeeNoNextActionCard();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'no_next_action',
        });

        await alice.goToAllProjects();
        await alice.shouldSeeNoNextActionOnAllProjects('Kitchen renovation');
        if (viewport.name === 'desktop') {
          await alice.shouldSeeNoNextActionDotOnRail('Kitchen renovation');
        }
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'all_projects_no_next_action',
        });
        if (viewport.name === 'phone') {
          await alice.openToday();
          await alice.openMobileTasksRail();
          await alice.shouldSeeNoNextActionDotOnRail('Kitchen renovation');
          await alice.saveWalkthroughScreenshot({
            story: WALKTHROUGH_STORY,
            step: 'rail_no_next_action',
          });
        }

        await alice.goToProject(kitchen.id);
        await alice.openProjectEditDialog();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'edit_dialog',
        });
        await alice.dismissProjectEditDialog();

        await alice.openProjectStatusSelect('Waiting');
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'status_control_open',
        });
        await alice.pageClickWaitingOption();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'waiting_form',
        });
        await alice.setProjectWaitingFromPage({
          waitingOn: 'Contractor',
          unknownSince: true,
        });
        await alice.shouldSeeWaitingSummary('since unknown');
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'waiting_unknown',
        });
        await alice.shouldSeeHistorySection();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'history_placeholder',
        });

        await alice.setProjectStatusFromPage('someday');
        await alice.shouldSeeSomedaySetNextActionLink();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'someday_set_next_action',
        });
      }, 120_000);
    }

    it('saves phone overflow shots of What’s next and Change next action', async () => {
      const alice = await ctx.createActor('alice-137-walkthrough-overflow@example.com');
      await alice.useMobileViewport();

      const kitchen = await alice.createProject({
        name: 'Kitchen renovation',
        objective: 'New counters installed and kitchen usable',
      });
      const quotes = await alice.createTask({
        title: 'Get three contractor quotes',
        projectId: kitchen.id,
      });
      for (let index = 1; index <= 12; index += 1) {
        await alice.createTask({
          title: `Overflow task ${index}`,
          projectId: kitchen.id,
        });
      }
      await alice.setNextAction(kitchen.id, { taskId: quotes.id });

      await alice.goToProject(kitchen.id);
      await alice.openNextActionPicker();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'picker_overflow',
      });
      await alice.dismissNextActionPicker();

      await alice.completeNextActionFromPage('Get three contractor quotes');
      await alice.shouldSeeWhatsNext();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'whats_next_overflow',
      });
    }, 90_000);
  });
});
