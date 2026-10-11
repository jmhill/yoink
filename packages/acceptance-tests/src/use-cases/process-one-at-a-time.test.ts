import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor, PlaywrightContext } from '@yoink/acceptance-testing';
import { ForbiddenError, UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Projects plan story 11 (#143): Process, one capture at a time.
 *
 * Oldest inbox capture first. "N left" matches the badge. Person-only
 * process-to-project. Capture cards stay as they are.
 */

const WALKTHROUGH_STORY = '143-process-one-at-a-time';
const DESKTOP = { width: 1440, height: 900 } as const;
const LONG_CLIP = [
  'Yoink ideas - forward text message, image/photo capture',
  'Need a way to send a photo from the phone and have it land in the inbox.',
].join('\n');

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
  describe(`Process, one capture at a time [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-143-process@example.com');
    });

    it('shows the oldest capture, N left, and the badge', async () => {
      await alice.createCapture({
        content: 'NOLA Brewing - Live Music / Events',
        sourceUrl: 'https://nolabrewing.com/events',
        sourceApp: 'browser-extension',
      });
      await alice.createCapture({ content: 'Harbor shed' });
      await alice.createCapture({ content: 'Paint the door' });
      await alice.createCapture({ content: 'Later garden idea' });
      await alice.createCapture({ content: 'Snooze me last' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessReady();
      await alice.shouldSeeProcessCurrent('NOLA Brewing - Live Music / Events');
      await alice.shouldSeeProcessSourceUrl('nolabrewing.com');
      await alice.shouldSeeProcessLeft(5);
      await alice.shouldSeeProcessBadge(5);
      await alice.shouldSeeClearOfMobileTabBar('[data-process-item-kind="capture"]');
    }, 60_000);

    it('trashes the current card, then Undo brings it back', async () => {
      await alice.createCapture({ content: 'Oldest clip' });
      await alice.createCapture({ content: 'Next clip' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessCurrent('Oldest clip');
      await alice.shouldSeeProcessLeft(2);

      await alice.trashProcessCurrent();
      await alice.shouldSeeProcessCurrent('Next clip');
      await alice.shouldSeeProcessLeft(1);
      await alice.shouldSeeUndoToast('Moved to trash');
      await alice.undoFromToast('Moved to trash');
      await alice.shouldSeeProcessCurrent('Oldest clip');
      await alice.shouldSeeProcessLeft(2);
      await alice.shouldNotSeeAlreadyProcessedNotice();
    }, 60_000);

    it('snoozes the current card, then Undo brings it back', async () => {
      await alice.createCapture({ content: 'Snooze first' });
      await alice.createCapture({ content: 'Stay next' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessCurrent('Snooze first');
      await alice.openProcessSnoozeMenu();
      await alice.pickProcessSnooze('tomorrow');
      await alice.shouldSeeProcessCurrent('Stay next');
      await alice.shouldSeeUndoToast('Snoozed');
      await alice.undoFromToast('Snoozed');
      await alice.shouldSeeProcessCurrent('Snooze first');
      await alice.shouldSeeProcessLeft(2);
      await alice.shouldNotSeeAlreadyProcessedNotice();
    }, 60_000);

    it('makes the current capture a task on a list and project', async () => {
      const chores = await alice.createNamedList('Chores');
      const shed = await alice.createProject({ name: 'Shed' });
      await alice.createCapture({ content: 'Paint the door' });
      await alice.createCapture({ content: 'Still in the queue' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.openProcessMakeTask();
      await alice.shouldSeePromoteSheet();
      const task = await alice.confirmPromoteOnListAndProject({
        listName: 'Chores',
        projectName: 'Shed',
        dueDate: '2026-10-20',
      });
      expect(task.listId).toBe(chores.id);
      expect(task.projectId).toBe(shed.id);
      expect(task.dueDate).toBe('2026-10-20');

      await alice.shouldSeeTaskCreatedToast();
      await alice.shouldSeeProcessCurrent('Still in the queue');
      await alice.shouldSeeProcessLeft(1);

      await alice.openMobileBottomTab('work');
      await alice.openNowListsSheet();
      await alice.pickNowList(chores.id);
      await alice.shouldSeeOpenTasksInOrder(['Paint the door']);
    }, 90_000);

    it('makes an active project from a capture and offers What’s next', async () => {
      await alice.createCapture({
        content: 'Harbor shed',
        sourceUrl: 'https://example.com/harbor',
      });
      await alice.createCapture({ content: LONG_CLIP });
      await alice.createCapture({ content: 'Still waiting' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.openProcessProjectSheet('active');
      await alice.shouldSeeProcessProjectPrefill({
        name: 'Harbor shed',
        objective: 'https://example.com/harbor',
      });
      await alice.fillProcessProject({ name: 'Harbor' });
      const created = await alice.confirmProcessProject();
      expect(created.project.name).toBe('Harbor');
      expect(created.project.status).toBe('active');
      expect(created.capture.processedToType).toBe('project');

      await alice.shouldSeeWhatsNext();
      await alice.skipWhatsNext();
      await alice.shouldSeeProcessCurrent(LONG_CLIP);
      await alice.openProcessProjectSheet('active');
      await alice.shouldSeeProcessProjectPrefill({
        name: 'Yoink ideas - forward text message, image/photo capture',
        objective: 'Need a way to send a photo from the phone and have it land in the inbox.',
      });
      await alice.cancelProcessProjectSheet();
      await alice.shouldSeeProcessLeft(2);

      await alice.openMobileBottomTab('review');
      await alice.openProjectFromIndex('Harbor');
      await alice.shouldSeeProjectPage({ name: 'Harbor', status: 'active' });
    }, 90_000);

    it('makes a someday project that lands in Review, not Work', async () => {
      await alice.createCapture({ content: 'Later garden idea' });
      await alice.createCapture({ content: 'Keep processing' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.openProcessProjectSheet('someday');
      await alice.fillProcessProject({ name: 'Later garden' });
      const created = await alice.confirmProcessProject();
      expect(created.project.status).toBe('someday');

      await alice.shouldNotSeeWhatsNext();
      await alice.shouldSeeProjectCreatedToast();
      await alice.shouldSeeProcessCurrent('Keep processing');
      await alice.shouldSeeProcessLeft(1);

      await alice.openMobileBottomTab('review');
      await alice.shouldSeeProjectOnAllProjects({ name: 'Later garden', status: 'someday' });
      await alice.openMobileBottomTab('work');
      await alice.shouldSeeNowReady('all');
    }, 90_000);

    it('snoozes the last capture into the empty state', async () => {
      await alice.createCapture({ content: 'Snooze me last' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessLeft(1);
      await alice.openProcessSnoozeMenu();
      await alice.pickProcessSnooze('tomorrow');
      await alice.shouldSeeProcessEmpty();
      await alice.shouldSeeProcessSnoozedComingBack(1);
      await alice.shouldSeeProcessBadge(null);

      await alice.openMobileBottomTab('capture');
      await alice.openInboxPaneTab('snoozed');
      await alice.shouldSeeCaptureOnCurrentPane('Snooze me last');
    }, 60_000);

    it('keeps the capture when the project name is already taken', async () => {
      await alice.createProject({ name: 'Garden' });
      await alice.createCapture({ content: 'Another garden' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.openProcessProjectSheet('active');
      await alice.fillProcessProject({ name: 'Garden' });
      await alice.shouldSeeProcessProjectError('A project with this name already exists');
      await alice.shouldSeeProcessCurrent('Another garden');
      await alice.shouldSeeProcessLeft(1);
    }, 60_000);

    it('does the same flow from the desktop keyboard', async () => {
      await alice.createCapture({ content: 'Desktop clip' });
      await alice.createCapture({ content: 'Second desktop' });
      await alice.createProject({ name: 'Garden' });

      await alice.useDesktopViewport(DESKTOP);
      await alice.openProcess();
      await alice.shouldSeeRailSectionHighlighted('process');
      await alice.shouldSeeProcessKeyHints();
      await alice.shouldSeeProcessCurrent('Desktop clip');
      await alice.shouldSeeProcessActionsFitCard();
      await alice.shouldSeeProcessLeft(2);

      await alice.pressProcessKey('t');
      await alice.shouldSeePromoteSheet();
      await alice.cancelPromoteSheet();

      await alice.pressProcessKey('p');
      await alice.shouldSeeProcessProjectPrefill({
        name: 'Desktop clip',
        objective: '',
      });
      await alice.fillProcessProject({ name: 'Typed name' });
      await alice.pressProcessKey('t');
      await alice.shouldSeeProcessProjectPrefill({
        name: 'Typed namet',
        objective: '',
      });
      await alice.fillProcessProject({ name: 'Garden' });
      await alice.shouldSeeProcessProjectError('A project with this name already exists');
      await alice.cancelProcessProjectSheet();

      await alice.pressProcessKey('s');
      await alice.fillProcessProject({ name: 'Someday desk' });
      await alice.confirmProcessProject();
      await alice.shouldNotSeeWhatsNext();
      await alice.shouldSeeProjectCreatedToast();
      await alice.shouldSeeProcessCurrent('Second desktop');
      await alice.shouldSeeProcessLeft(1);

      await alice.pressProcessKey('Delete');
      await alice.shouldSeeProcessEmpty();
      await alice.shouldSeeUndoToast('Moved to trash');
      await alice.undoFromToast('Moved to trash');
      await alice.shouldSeeProcessCurrent('Second desktop');
      await alice.shouldNotSeeAlreadyProcessedNotice();

      await alice.pressProcessKey('z');
      await alice.pickProcessSnooze('tomorrow');
      await alice.shouldSeeProcessEmpty();
      await alice.shouldSeeUndoToast('Snoozed');
      await alice.undoFromToast('Snoozed');
      await alice.shouldSeeProcessCurrent('Second desktop');
      await alice.shouldNotSeeAlreadyProcessedNotice();
      await alice.pressProcessKey('z');
      await alice.pickProcessSnooze('tomorrow');
      await alice.shouldSeeProcessEmpty();
    }, 90_000);

    it('ignores a second Delete while the first trash is pending', async () => {
      await alice.createCapture({ content: 'First desk' });
      await alice.createCapture({ content: 'Second desk' });

      await alice.useDesktopViewport(DESKTOP);
      await alice.openProcess();
      await alice.shouldSeeProcessCurrent('First desk');
      await alice.pressProcessDeleteWhileTrashHeld();
      await alice.shouldSeeProcessCurrent('Second desk');
      await alice.shouldSeeProcessLeft(1);
      const inbox = await alice.listCaptures();
      const trash = await alice.listTrashedCaptures();
      expect(inbox.map((capture) => capture.content)).toEqual(['Second desk']);
      expect(trash.map((capture) => capture.content)).toEqual(['First desk']);
    }, 60_000);

    it('keeps all five process actions inside the card on desktop widths', async () => {
      await alice.createCapture({ content: 'Fit the buttons' });
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1024, height: 768 },
        { width: 800, height: 700 },
      ] as const) {
        await alice.useDesktopViewport(viewport);
        await alice.openProcess();
        await alice.shouldSeeProcessCurrent('Fit the buttons');
        await alice.shouldSeeProcessActionsFitCard();
      }
    }, 60_000);

    it('moves on when another device processes the current capture', async () => {
      const first = await alice.createCapture({ content: 'Taken elsewhere' });
      await alice.createCapture({ content: 'Still mine' });
      const device = await otherDevice(alice, ctx, 'other-device');

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessCurrent('Taken elsewhere');
      await alice.useShortLiveQueryInterval();
      const live = alice.awaitLiveInboxCaptures(
        (captures) => !captures.some((capture) => capture.id === first.id)
      );
      await device.processCaptureToTask(first.id);
      await live;
      await alice.shouldSeeProcessCurrent('Still mine');
      await alice.shouldSeeAlreadyProcessedNotice();
    }, 60_000);

    it('saves phone walkthrough shots', async () => {
      await alice.createCapture({
        content: 'NOLA Brewing - Live Music / Events',
        sourceUrl: 'https://www.nolabrewing.com/events',
        sourceApp: 'browser-extension',
      });
      await alice.createCapture({ content: 'Harbor shed' });
      await alice.createCapture({ content: LONG_CLIP });
      await alice.createCapture({ content: 'Later garden idea' });
      await alice.createCapture({ content: 'Snooze me last' });
      await alice.createProject({ name: 'Garden' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessCurrent('NOLA Brewing - Live Music / Events');
      await alice.shouldSeeProcessLeft(5);
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'process_card' });

      await alice.useAppearance({ mode: 'dark', colorTheme: 'default' });
      await alice.openMobileBottomTab('process');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_card_dark',
      });
      await alice.useAppearance({ mode: 'light', colorTheme: 'default' });
      await alice.openMobileBottomTab('process');

      await alice.openProcessMakeTask();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_task_sheet',
      });
      await alice.cancelPromoteSheet();

      await alice.openProcessProjectSheet('active');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_project_sheet',
      });
      await alice.cancelProcessProjectSheet();

      await alice.trashProcessCurrent();
      await alice.shouldSeeUndoToast('Moved to trash');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_undo_toast',
        includeToasts: true,
      });

      await alice.shouldSeeProcessCurrent('Harbor shed');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_card_plain',
      });
      await alice.openProcessProjectSheet('active');
      await alice.fillProcessProject({ name: 'Harbor' });
      await alice.confirmProcessProject();
      await alice.shouldSeeWhatsNext();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_whats_next',
      });
      await alice.skipWhatsNext();

      await alice.shouldSeeProcessCurrent(LONG_CLIP);
      await alice.openProcessProjectSheet('active');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_project_sheet_long',
      });
      await alice.cancelProcessProjectSheet();

      await alice.openProcessProjectSheet('someday');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_someday_sheet',
      });
      await alice.fillProcessProject({ name: 'Later garden' });
      await alice.confirmProcessProject();

      await alice.openProcessProjectSheet('active');
      await alice.fillProcessProject({ name: 'Garden' });
      await alice.shouldSeeProcessProjectError('A project with this name already exists');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_duplicate_name',
      });
      await alice.cancelProcessProjectSheet();

      await alice.openProcessSnoozeMenu();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_snooze_menu',
      });
      await alice.pickProcessSnooze('tomorrow');

      await alice.openProcessSnoozeMenu();
      await alice.pickProcessSnooze('tomorrow');
      await alice.shouldSeeProcessEmpty();
      await alice.shouldSeeProcessSnoozedComingBack(2);
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'process_empty' });

      await alice.openMobileBottomTab('review');
      await alice.shouldSeeProjectOnAllProjects({ name: 'Later garden', status: 'someday' });
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_someday_group',
      });
    }, 90_000);

    it('saves desktop walkthrough shots', async () => {
      await alice.createCapture({
        content: 'NOLA Brewing - Live Music / Events',
        sourceUrl: 'https://www.nolabrewing.com/events',
        sourceApp: 'browser-extension',
      });
      await alice.createCapture({ content: 'Harbor shed' });
      await alice.createCapture({ content: LONG_CLIP });
      await alice.createCapture({ content: 'Desktop leftover' });

      await alice.useDesktopViewport(DESKTOP);
      await alice.openProcess();
      await alice.shouldSeeRailSectionHighlighted('process');
      await alice.shouldSeeProcessKeyHints();
      await alice.shouldSeeProcessCurrent('NOLA Brewing - Live Music / Events');
      await alice.shouldSeeProcessActionsFitCard();
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'process_card' });

      await alice.openProcessProjectSheet('active');
      await alice.shouldSeeProcessProjectPrefill({
        name: 'NOLA Brewing - Live Music / Events',
        objective: 'https://www.nolabrewing.com/events',
      });
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_project_sheet',
      });
      await alice.cancelProcessProjectSheet();

      await alice.trashProcessCurrent();
      await alice.shouldSeeUndoToast('Moved to trash');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_undo_toast',
        includeToasts: true,
      });

      await alice.shouldSeeProcessCurrent('Harbor shed');
      await alice.openProcessProjectSheet('active');
      await alice.fillProcessProject({ name: 'Harbor desk' });
      await alice.confirmProcessProject();
      await alice.shouldSeeWhatsNext();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_whats_next',
      });
      await alice.skipWhatsNext();

      await alice.shouldSeeProcessCurrent(LONG_CLIP);
      await alice.openProcessProjectSheet('active');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_project_sheet_long',
      });
      await alice.cancelProcessProjectSheet();
      await alice.openProcessSnoozeMenu();
      await alice.pickProcessSnooze('tomorrow');
      await alice.shouldSeeProcessCurrent('Desktop leftover');
      await alice.trashProcessCurrent();
      await alice.shouldSeeProcessEmpty();
      await alice.shouldSeeProcessSnoozedComingBack(1);
      await alice.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'process_empty' });
    }, 90_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Process to project — HTTP [${ctx.driverName}]`, () => {
    it('lets a person process a capture to a project and refuses a bot', async () => {
      const alice = await ctx.createActor('alice-143-process-http@example.com');
      const capture = await alice.createCapture({ content: 'Harbor shed' });
      const result = await alice.processCaptureToProject(capture.id, {
        name: 'Harbor',
        objective: 'Fix the door',
        status: 'active',
      });
      expect(result.project.name).toBe('Harbor');
      expect(result.project.status).toBe('active');
      expect(result.capture.status).toBe('processed');
      expect(result.capture.processedToType).toBe('project');
      expect(result.capture.processedToId).toBe(result.project.id);

      const later = await alice.createCapture({ content: 'Later idea' });
      const minted = await alice.mintAgent('Lane');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });
      await expect(
        bot.processCaptureToProject(later.id, { name: 'Bot garden', status: 'active' })
      ).rejects.toThrow(ForbiddenError);
      const still = await alice.getCapture(later.id);
      expect(still.status).toBe('inbox');
    });

    it('stubs the new Process page operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-143-process-http-stubs@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeProcessCurrent('Nope')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeProcessLeft(1)).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.openProcessProjectSheet('active')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.pressProcessDeleteWhileTrashHeld()).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeProcessActionsFitCard()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeUndoToast('Moved to trash')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeTaskCreatedToast()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeProjectCreatedToast()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldNotSeeAlreadyProcessedNotice()).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
