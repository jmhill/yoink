import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Projects plan story 10a (#141): four tabs on phone.
 *
 * Polly lock (Sun Oct 11): Capture | Process | Work | Review. Capture
 * stays the inbox at `/`. Process is one capture at a time, oldest first.
 * Work stays Now + lists. Review is `/projects` with + New project.
 * Desktop rail and ⌘K do not change.
 */

const WALKTHROUGH_STORY = '141-four-tabs-phone';
const FOUR_TABS = ['Capture', 'Process', 'Work', 'Review'] as const;
const DESKTOP_1440 = { width: 1440, height: 900 } as const;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Four tabs on phone [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-141-four-tabs@example.com');
    });

    it('shows Capture, Process, Work, Review and lights only the matching tab', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createProject({ name: 'Garden' });
      await alice.createCapture({ content: 'Clip for tabs' });
      const staged = await alice.stageProjectImport([
        { name: 'Harbor shed', status: 'active', newTasks: [{ key: 'paint', title: 'Paint the door' }] },
      ]);

      await alice.useMobileViewport();
      await alice.shouldSeeMobileBottomTabs([...FOUR_TABS]);

      await alice.openMobileBottomTab('capture');
      await alice.shouldSeeLitMobileTab('capture');
      await alice.shouldSeeQuickAddCapture();
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'capture_tab' });

      await alice.openInboxPaneTab('snoozed');
      await alice.shouldSeeLitMobileTab('capture');
      await alice.openInboxPaneTab('trash');
      await alice.shouldSeeLitMobileTab('capture');
      await alice.openInboxPaneTab('inbox');

      await alice.openMobileBottomTab('process');
      await alice.shouldSeeLitMobileTab('process');
      await alice.shouldSeeProcessReady();
      await alice.shouldSeeProcessBadge(1);

      await alice.openMobileBottomTab('work');
      await alice.shouldSeeLitMobileTab('work');
      await alice.shouldSeeNowReady('all');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'work_tab' });

      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeLitMobileTab('work');
      await alice.shouldSeeBackToWork();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'work_list_picked_back_link',
      });

      await alice.openNamedListUrl(groceries.id);
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeLitMobileTab('work');
      await alice.shouldSeeBackToWork();

      await alice.openRailSmartView('today');
      await alice.shouldBeOnToday();
      await alice.shouldSeeLitMobileTab('work');
      await alice.shouldNotSeeBackToWork();

      await alice.openMobileBottomTab('review');
      await alice.shouldSeeLitMobileTab('review');
      await alice.shouldSeeReviewNewProject();
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'review_tab' });

      await alice.openProjectFromIndex('Garden');
      await alice.shouldSeeProjectPage({ name: 'Garden', status: 'active' });
      await alice.shouldSeeLitMobileTab('review');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'review_project_open' });
      await alice.openAllProjectsBackLink();
      await alice.shouldSeeProjectOnAllProjects({ name: 'Garden', status: 'active' });
      await alice.shouldSeeLitMobileTab('review');

      await alice.goToImportPreview(staged.id);
      await alice.shouldSeeImportPreviewProject('Harbor shed');
      await alice.shouldSeeLitMobileTab('review');
      await alice.shouldSeePendingImportBanner('staged an import');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_import_preview',
      });

      await alice.goToSettings();
      await alice.shouldSeeLitMobileTab(null);
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'settings_no_tab_lit' });
    }, 90_000);

    it('keeps Capture as inbox: quick add, swipe-trash, snooze, and pane tabs', async () => {
      await alice.useMobileViewport();
      await alice.openMobileBottomTab('capture');
      await alice.shouldSeeQuickAddCapture();
      await alice.shouldSeeInboxPaneTabs(['Inbox', 'Snoozed', 'Trash']);

      await alice.createCapture({ content: 'Keep on capture' });
      await alice.createCapture({ content: 'Swipe me out' });
      await alice.createCapture({ content: 'Snooze from capture' });
      await alice.shouldSeeCaptureOnCurrentPane('Keep on capture');

      await alice.trashCaptureBySwipe('Swipe me out');
      await alice.shouldNotSeeCaptureOnCurrentPane('Swipe me out');
      await alice.snoozeCaptureOnCurrentPane('Snooze from capture');
      await alice.shouldNotSeeCaptureOnCurrentPane('Snooze from capture');

      await alice.openInboxPaneTab('snoozed');
      await alice.shouldSeeCaptureOnCurrentPane('Snooze from capture');
      await alice.openInboxPaneTab('trash');
      await alice.shouldSeeCaptureOnCurrentPane('Swipe me out');
      await alice.openInboxPaneTab('inbox');
      await alice.shouldSeeCaptureOnCurrentPane('Keep on capture');
    }, 60_000);

    it('shows Process oldest first with the badge, then empties after triage', async () => {
      const chores = await alice.createNamedList('Chores');
      const shed = await alice.createProject({ name: 'Shed' });
      await alice.createCapture({ content: 'Oldest clip' });
      await alice.createCapture({ content: 'Middle clip' });
      await alice.createCapture({ content: 'Newest clip' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('capture');
      await alice.shouldSeeProcessBadge(3);

      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessReady();
      await alice.shouldSeeProcessLeft(3);
      await alice.shouldSeeProcessCurrent('Oldest clip');
      await alice.shouldSeeProcessBadge(3);
      await alice.shouldNotSeeQuickAddCapture();
      await alice.shouldSeeClearOfMobileTabBar('[data-capture-id]');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'process_tab' });

      await alice.trashCaptureOnCurrentPane('Oldest clip');
      await alice.shouldSeeProcessCurrent('Middle clip');
      await alice.shouldSeeProcessLeft(2);
      await alice.shouldSeeProcessBadge(2);

      await alice.openPromoteSheet('Middle clip');
      await alice.shouldSeePromoteSheet();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_promote_sheet',
      });
      const task = await alice.confirmPromoteOnListAndProject({
        listName: 'Chores',
        projectName: 'Shed',
      });
      expect(task.listId).toBe(chores.id);
      expect(task.projectId).toBe(shed.id);

      await alice.shouldSeeProcessCurrent('Newest clip');
      await alice.shouldSeeProcessLeft(1);
      await alice.snoozeCaptureOnCurrentPane('Newest clip');
      await alice.shouldSeeProcessEmpty();
      await alice.shouldSeeProcessBadge(null);
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'process_empty' });

      await alice.openMobileBottomTab('work');
      await alice.openNowListsSheet();
      await alice.pickNowList(chores.id);
      await alice.shouldSeeOpenTasksInOrder(['Middle clip']);
    }, 90_000);

    it('lands share fallback on Capture with the new clip listed', async () => {
      await alice.useMobileViewport();
      const capture = await alice.shareContent({ text: 'Shared into Capture' });
      expect(capture.content).toBe('Shared into Capture');
      await alice.shouldSeeLitMobileTab('capture');
      await alice.shouldSeeCaptureOnCurrentPane('Shared into Capture');
    });

    it('returns from a phone list to Work with the ‹ Work link', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('work');
      await alice.shouldSeeNowReady('all');
      await alice.openNowListsSheet();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'work_lists_sheet_open',
      });
      await alice.pickNowList(groceries.id);
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeBackToWork();
      await alice.shouldSeeLitMobileTab('work');
      await alice.openBackToWork();
      await alice.shouldSeeNowReady('all');
      await alice.shouldSeeLitMobileTab('work');
    }, 60_000);

    it('opens Review on /projects and creates a project from + New project', async () => {
      await alice.createProject({ name: 'Existing' });
      await alice.useMobileViewport();
      await alice.openMobileBottomTab('review');
      await alice.shouldSeeProjectOnAllProjects({ name: 'Existing', status: 'active' });
      await alice.shouldSeeReviewNewProject();
      await alice.shouldSeeClearOfMobileTabBar('[data-projects-index] a');

      const created = await alice.createProjectFromReview({ name: 'From Review' });
      await alice.shouldSeeProjectPage({ name: 'From Review', status: 'active' });
      await alice.shouldSeeLitMobileTab('review');
      expect(created.name).toBe('From Review');
    }, 60_000);

    it('keeps the Work drawer destinations: Today, Mine, lists, Unlisted, New list, a project, New project', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createProject({ name: 'Garden' });
      await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('work');
      await alice.openMobileTasksRail();
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'work_drawer_open' });

      await alice.openRailSmartView('today');
      await alice.shouldBeOnToday();
      await alice.openRailSmartView('mine');
      await alice.shouldBeOnMineOverview();
      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.openRailUnlisted();
      await alice.shouldBeOnAllUnlistedPile();

      const weekend = await alice.createNamedListFromRail('Weekend');
      await alice.shouldBeOnAllNamedPile(weekend.id);

      await alice.openMobileTasksRail();
      await alice.openRailProject('Garden');
      await alice.shouldSeeProjectPage({ name: 'Garden', status: 'active' });

      const created = await alice.createProjectFromRail({ name: 'From Drawer' });
      await alice.shouldSeeProjectPage({ name: 'From Drawer', status: 'active' });
      expect(created.name).toBe('From Drawer');
    }, 90_000);

    it('shows four desktop sections and lights Process on /process', async () => {
      await alice.createNamedList('Groceries');
      await alice.createProject({ name: 'Garden' });
      await alice.createCapture({ content: 'Desktop clip' });

      await alice.useDesktopViewport(DESKTOP_1440);
      await alice.shouldNotSeeMobileBottomNav();
      await alice.shouldSeeDesktopAppRail();
      await alice.openRailReview();
      await alice.shouldSeeRailItems([
        'Capture',
        'Process',
        'Work',
        'Today',
        'Upcoming',
        'My tasks',
        'Done',
        'Groceries',
        'Unlisted',
        'New list',
        'Review',
        'Garden',
        'New project',
      ]);

      await alice.openRailCapture();
      await alice.shouldSeeRailCaptureHighlighted();
      await alice.shouldSeeQuickAddCapture();
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'inbox' });

      await alice.openWork();
      await alice.shouldSeeNowReady('all');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'now' });

      await alice.openProcess();
      await alice.shouldSeeProcessReady();
      await alice.shouldSeeRailSectionHighlighted('process');
      await alice.shouldNotSeeMobileBottomNav();
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'process' });

      await alice.goToAllProjects();
      await alice.shouldSeeProjectOnAllProjects({ name: 'Garden', status: 'active' });
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'projects' });

      await alice.openWork();
      await alice.pressQuickCaptureShortcut();
      await alice.shouldHaveQuickCaptureFocused();
      await alice.shouldSeeQuickAddCapture();
    }, 90_000);

    it('keeps Capture readable in dark and tokyo-night', async () => {
      await alice.createCapture({ content: 'Theme clip' });
      await alice.useMobileViewport();
      await alice.openMobileBottomTab('capture');
      await alice.shouldSeeCaptureOnCurrentPane('Theme clip');

      await alice.useAppearance({ mode: 'dark', colorTheme: 'default' });
      await alice.openMobileBottomTab('capture');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'capture_tab_dark',
      });

      await alice.useAppearance({ mode: 'light', colorTheme: 'tokyo-night' });
      await alice.openMobileBottomTab('capture');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'capture_tab_tokyo_night',
      });
    }, 90_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Four tabs on phone — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs the new phone-tab operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-141-four-tabs-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.openMobileBottomTab('capture')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeLitMobileTab('process')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeProcessReady()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.openBackToWork()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.createProjectFromReview({ name: 'Nope' })).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
