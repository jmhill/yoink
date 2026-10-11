import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Projects plan story 10b (#142): four sections in the desktop sidebar.
 *
 * Capture, Process, Work, Review match the phone tabs. Work replaces Now.
 * Smart views and lists sit under Work; projects sit under Review.
 * Phone tabs and the Work drawer stay the same, except Mine → My tasks.
 */

const WALKTHROUGH_STORY = '142-desktop-sections';
const DESKTOP = { width: 1440, height: 900 } as const;
const FOUR_TABS = ['Capture', 'Process', 'Work', 'Review'] as const;

const desktopRailWith = (lists: string[], projects: string[]): string[] => [
  'Capture',
  'Process',
  'Work',
  'Today',
  'Upcoming',
  'My tasks',
  'Done',
  ...lists,
  'Unlisted',
  'New list',
  'Review',
  ...projects,
  'New project',
];

const drawerRailWith = (lists: string[], projects: string[]): string[] => [
  'Inbox',
  'Now',
  'Today',
  'Upcoming',
  'My tasks',
  'Done',
  ...lists,
  'Unlisted',
  'New list',
  ...projects,
  'New project',
];

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Desktop sidebar sections [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-142-desktop-sections@example.com');
    });

    it('shows Capture, Process, Work, and Review with children in the locked order', async () => {
      await alice.createNamedList('Chores');
      await alice.createNamedList('Groceries');
      await alice.createProject({ name: 'Garden' });
      await alice.createProject({ name: 'Shed' });
      const later = await alice.createProject({ name: 'Later' });
      await alice.changeProjectStatus(later.id, { status: 'someday' });

      await alice.useDesktopViewport(DESKTOP);
      await alice.shouldSeeDesktopAppRail();
      await alice.openRailReview();
      await alice.shouldSeeDesktopRailSections();
      await alice.shouldSeeRailItems(
        desktopRailWith(['Chores', 'Groceries'], ['Garden', 'Shed', 'Later'])
      );
    }, 90_000);

    it('lights one row at a time for each section, smart view, list, and project', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const garden = await alice.createProject({ name: 'Garden' });
      const later = await alice.createProject({ name: 'Later' });
      await alice.changeProjectStatus(later.id, { status: 'someday' });
      await alice.createCapture({ content: 'Clip for lighting' });
      const staged = await alice.stageProjectImport([
        {
          name: 'Harbor shed',
          status: 'active',
          newTasks: [{ key: 'paint', title: 'Paint the door' }],
        },
      ]);

      await alice.useDesktopViewport(DESKTOP);

      await alice.openRailCapture();
      await alice.shouldSeeRailSectionHighlighted('capture');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'capture_lit' });

      await alice.openInboxPaneTab('snoozed');
      await alice.shouldSeeRailSectionHighlighted('capture');
      await alice.openInboxPaneTab('trash');
      await alice.shouldSeeRailSectionHighlighted('capture');
      await alice.openInboxPaneTab('inbox');

      await alice.openRailProcess();
      await alice.shouldSeeRailSectionHighlighted('process');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'process_lit' });

      await alice.openRailWork();
      await alice.shouldSeeRailSectionHighlighted('work');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'work_lit' });

      await alice.openWork({ mine: true });
      await alice.shouldSeeNowReady('me');
      await alice.shouldSeeRailSectionHighlighted('work');

      await alice.openRailSmartView('today');
      await alice.shouldSeeRailRowHighlighted('Today');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'smart_view_today_lit',
      });
      await alice.openRailSmartView('upcoming');
      await alice.shouldSeeRailRowHighlighted('Upcoming');
      await alice.openRailSmartView('mine');
      await alice.shouldSeeRailRowHighlighted('My tasks');
      await alice.openRailSmartView('done');
      await alice.shouldSeeRailRowHighlighted('Done');

      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeRailRowHighlighted('Groceries');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'list_lit' });

      await alice.openRailUnlisted();
      await alice.shouldBeOnAllUnlistedPile();
      await alice.shouldSeeRailRowHighlighted('Unlisted');

      await alice.openRailReview();
      await alice.shouldSeeRailSectionHighlighted('review');
      await alice.shouldSeeReviewNewProject();
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'review_lit' });

      await alice.openRailProject('Garden');
      await alice.shouldSeeProjectPage({ name: 'Garden', status: 'active' });
      await alice.shouldSeeRailRowHighlighted('Garden');
      expect(garden.name).toBe('Garden');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'project_lit' });

      await alice.openSomedayGroup();
      await alice.openRailProject('Later');
      await alice.shouldSeeProjectPage({ name: 'Later', status: 'someday' });
      await alice.shouldSeeRailRowHighlighted('Later');
      await alice.openSomedayGroup();
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'someday_open' });

      await alice.goToImportPreview(staged.id);
      await alice.shouldSeeImportPreviewProject('Harbor shed');
      await alice.shouldSeeRailSectionHighlighted('review');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'import_preview_review_lit',
      });

      await alice.goToSettings();
      await alice.shouldSeeNoRailItemHighlighted();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'settings_nothing_lit',
      });
    }, 90_000);

    it('shows the Process badge at 3 and hides it at 0; Capture has no count', async () => {
      await alice.createCapture({ content: 'Oldest clip' });
      await alice.createCapture({ content: 'Middle clip' });
      await alice.createCapture({ content: 'Newest clip' });

      await alice.useDesktopViewport(DESKTOP);
      await alice.openRailCapture();
      await alice.shouldSeeInboxTriageSurface();
      await alice.shouldSeeProcessCountOnRail(3);
      await alice.shouldSeeNoCountOnCaptureSection();

      await alice.openRailProcess();
      await alice.shouldSeeProcessCountOnRail(3);
      await alice.trashCaptureOnCurrentPane('Oldest clip');
      await alice.trashCaptureOnCurrentPane('Middle clip');
      await alice.trashCaptureOnCurrentPane('Newest clip');
      await alice.shouldSeeProcessReady();
      await alice.shouldNotSeeProcessCountOnRail();
      await alice.shouldSeeNoCountOnCaptureSection();
    }, 90_000);

    it('keeps ⌘K landing on Capture from Work, Process, and Review', async () => {
      await alice.createNamedList('Groceries');
      await alice.createProject({ name: 'Garden' });
      await alice.useDesktopViewport(DESKTOP);

      await alice.openRailWork();
      await alice.pressQuickCaptureShortcut();
      await alice.shouldHaveQuickCaptureFocused();
      await alice.shouldSeeQuickAddCapture();
      await alice.shouldSeeRailCaptureHighlighted();

      await alice.openRailProcess();
      await alice.pressQuickCaptureShortcut();
      await alice.shouldHaveQuickCaptureFocused();
      await alice.shouldSeeRailCaptureHighlighted();

      await alice.openRailReview();
      await alice.pressQuickCaptureShortcut();
      await alice.shouldHaveQuickCaptureFocused();
      await alice.shouldSeeRailCaptureHighlighted();

      const today = new Date().toISOString().split('T')[0]!;
      const task = await alice.createTask({ title: 'Existing task', dueDate: today });
      await alice.openToday();
      await alice.openTaskEditFromRow(task.id);
      await alice.shouldSeeExistingTaskEditUi();
      await alice.focusTaskEditTitle();
      await alice.pressQuickCaptureShortcut();
      await alice.shouldSeeExistingTaskEditUi();
    }, 90_000);

    it('creates, renames, and deletes from the new rail, including + New project on Review', async () => {
      await alice.useDesktopViewport(DESKTOP);

      const chores = await alice.createNamedListFromRail('Chores');
      await alice.shouldBeOnAllNamedPile(chores.id);
      await alice.shouldSeeRailRowHighlighted('Chores');

      await alice.renameNamedListFromRail('Chores', 'Errands');
      await alice.shouldSeeRailItems(desktopRailWith(['Errands'], []));

      await alice.deleteNamedListFromRail('Errands');
      await alice.shouldBeOnToday();
      await alice.shouldSeeRailItems(desktopRailWith([], []));

      const fromRail = await alice.createProjectFromRail({ name: 'From rail' });
      await alice.shouldSeeProjectPage({ name: 'From rail', status: 'active' });
      await alice.shouldSeeRailRowHighlighted('From rail');
      expect(fromRail.name).toBe('From rail');

      await alice.openRailReview();
      await alice.shouldSeeReviewNewProject();
      const fromPage = await alice.createProjectFromReview({ name: 'From Review page' });
      await alice.shouldSeeProjectPage({ name: 'From Review page', status: 'active' });
      expect(fromPage.name).toBe('From Review page');

      await alice.goToSettings();
      await alice.shouldSeeNoRailItemHighlighted();
    }, 90_000);

    it('reads Capture as the heading with Inbox | Snoozed | Trash still working', async () => {
      await alice.createCapture({ content: 'Stay in inbox' });
      await alice.useDesktopViewport(DESKTOP);
      await alice.openRailCapture();
      await alice.shouldSeeInboxTriageSurface();
      await alice.shouldSeeInboxPaneTabs(['Inbox', 'Snoozed', 'Trash']);
      await alice.shouldSeeCaptureOnCurrentPane('Stay in inbox');
      await alice.openInboxPaneTab('snoozed');
      await alice.shouldSeeInboxTriageSurface();
      await alice.openInboxPaneTab('trash');
      await alice.shouldSeeInboxTriageSurface();
      await alice.openInboxPaneTab('inbox');
      await alice.shouldSeeCaptureOnCurrentPane('Stay in inbox');
    }, 60_000);

    it('leaves the phone tabs and Work drawer unchanged aside from My tasks', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createNamedList('Weekend');
      await alice.createProject({ name: 'Garden' });
      const later = await alice.createProject({ name: 'Later' });
      await alice.changeProjectStatus(later.id, { status: 'someday' });
      await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.useMobileViewport();
      await alice.shouldSeeMobileBottomTabs([...FOUR_TABS]);

      await alice.openMobileBottomTab('capture');
      await alice.shouldSeeInboxTriageSurface();
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'capture_tab' });

      await alice.openMobileBottomTab('work');
      await alice.shouldSeeNowReady('all');
      await alice.openMobileTasksRail();
      await alice.shouldSeeRailItems(drawerRailWith(['Groceries', 'Weekend'], ['Garden', 'Later']));
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'work_drawer_unchanged',
      });

      await alice.openRailWork();
      await alice.openNowListsSheet();
      await alice.pickNowList(groceries.id);
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeBackToWork();
      await alice.shouldSeeBackToWorkAbovePlaceHeading();
      await alice.shouldSeeLitMobileTab('work');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'list_back_row' });
      await alice.openBackToWork();
      await alice.shouldSeeNowReady('all');
    }, 90_000);

    it('wraps long list and project names without sideways scroll, and keeps section rows on one line', async () => {
      await alice.createNamedList('Household Shopping');
      for (const name of [
        'Bills',
        'Car',
        'Desk',
        'Errands',
        'Files',
        'Garden list',
        'Health',
        'Inbox later',
        'Journal',
      ]) {
        await alice.createNamedList(name);
      }
      await alice.createProject({ name: 'Mortgage transfer (Fidelity to OnPath)' });
      for (const name of [
        'Alpha',
        'Bravo',
        'Cabin',
        'Delta',
        'Echo',
        'Foxtrot',
        'Golf',
        'Harbor',
        'Igloo',
        'Juliet',
        'Kilo',
        'Lima',
        'Mike',
        'November',
        'Oscar',
        'Papa',
        'Quebec',
      ]) {
        await alice.createProject({ name });
      }

      await alice.useDesktopViewport(DESKTOP);
      await alice.openRailWork();
      await alice.shouldSeeWrappedRailNamedList('Household Shopping');
      await alice.shouldSeeNoHorizontalPageScrollFromRail();
      await alice.shouldSeeRailLabelOnOneLine('Capture');
      await alice.shouldSeeRailLabelOnOneLine('Process');
      await alice.shouldSeeRailLabelOnOneLine('Work');
      await alice.shouldSeeRailLabelOnOneLine('Review');
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'long_rail_top' });

      await alice.scrollDesktopRailSoLabelIsVisible('Review');
      await alice.scrollDesktopRailSoLabelIsVisible('Mortgage transfer (Fidelity to OnPath)');
      await alice.shouldSeeNoHorizontalPageScrollFromRail();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'long_rail_scrolled',
      });
    }, 90_000);

    it('keeps Capture readable in dark and tokyo-night', async () => {
      await alice.createCapture({ content: 'Theme clip' });
      await alice.useDesktopViewport(DESKTOP);
      await alice.openRailCapture();
      await alice.shouldSeeInboxTriageSurface();

      await alice.useAppearance({ mode: 'dark', colorTheme: 'default' });
      await alice.openRailCapture();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'capture_lit_dark',
      });

      await alice.useAppearance({ mode: 'light', colorTheme: 'tokyo-night' });
      await alice.openRailCapture();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'capture_lit_tokyo_night',
      });
    }, 90_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Desktop sidebar sections — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs the new rail operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-142-desktop-sections-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeDesktopRailSections()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeRailSectionHighlighted('process')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.openRailProcess()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.openRailReview()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeRailRowHighlighted('Today')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeNoCountOnCaptureSection()).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeBackToWorkAbovePlaceHeading()).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.scrollDesktopRailSoLabelIsVisible('Review')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
