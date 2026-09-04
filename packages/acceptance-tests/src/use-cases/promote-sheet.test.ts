import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError, ValidationError } from '@yoink/acceptance-testing';

/**
 * Yoink UI story 5: Promote opens a thin sheet with title + optional list.
 *
 * From Inbox, Promote is a sheet (not the old centered Create Task dialog).
 * Title is prefilled from the capture. List defaults to Unlisted (omit listId).
 * A named list joins that pile’s open order via the existing process path.
 * Cancel leaves the capture in Inbox. Suggested list is out.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Promote sheet [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-5-promote@example.com');
    });

    it('opens a sheet from Inbox Promote, not the old centered dialog', async () => {
      await alice.createCapture({ content: 'Buy oat milk' });
      await alice.openRailInbox();
      await alice.shouldSeeCaptureOnCurrentPane('Buy oat milk');

      await alice.openPromoteSheet('Buy oat milk');
      await alice.shouldSeePromoteSheet();
      await alice.shouldSeePromoteTitlePrefill('Buy oat milk');
      await alice.shouldSeePromoteListUnlisted();
    });

    it('promotes as unlisted: no listId and the capture leaves Inbox', async () => {
      await alice.createCapture({ content: 'Loose thought' });
      await alice.openRailInbox();
      await alice.openPromoteSheet('Loose thought');

      const task = await alice.confirmPromoteUnlisted();
      expect(task.listId).toBeUndefined();
      expect(task.title).toBe('Loose thought');

      await alice.shouldBeOnInboxPane();
      await alice.shouldNotSeeCaptureOnCurrentPane('Loose thought');

      await alice.openRailUnlisted();
      await alice.shouldSeeOpenTasksInOrder(['Loose thought']);
    });

    it('promotes onto a named list and the task appears on that pile', async () => {
      const list = await alice.createNamedListFromRail('Groceries');
      await alice.createCapture({ content: 'Buy milk' });
      await alice.openRailInbox();
      await alice.openPromoteSheet('Buy milk');
      await alice.shouldSeePromoteListUnlisted();

      const task = await alice.confirmPromoteOnList('Groceries');
      expect(task.listId).toBe(list.id);
      expect(task.title).toBe('Buy milk');

      await alice.shouldNotSeeCaptureOnCurrentPane('Buy milk');

      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeOpenTasksInOrder(['Buy milk']);
    });

    it('leaves the capture in Inbox when Promote is cancelled', async () => {
      await alice.createCapture({ content: 'Keep me' });
      await alice.openRailInbox();
      await alice.openPromoteSheet('Keep me');
      await alice.cancelPromoteSheet();

      await alice.shouldBeOnInboxPane();
      await alice.shouldSeeCaptureOnCurrentPane('Keep me');
    });

    it('keeps Snooze, Trash, Inbox tabs, and the rail working', async () => {
      await alice.createCapture({ content: 'Stay put' });
      const later = await alice.createCapture({ content: 'Snooze later' });
      const gone = await alice.createCapture({ content: 'Trash me' });
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
      await alice.snoozeCapture(later.id, tomorrow);
      await alice.trashCapture(gone.id);

      await alice.openRailInbox();
      await alice.shouldSeeInboxCaptureActions('Stay put');
      await alice.shouldSeeInboxPaneTabs(['Inbox', 'Snoozed', 'Trash']);

      await alice.openInboxPaneTab('snoozed');
      await alice.shouldSeeCaptureOnCurrentPane('Snooze later');
      await alice.openInboxPaneTab('trash');
      await alice.shouldSeeCaptureOnCurrentPane('Trash me');

      await alice.openRailInbox();
      await alice.shouldBeOnInboxPane();
      await alice.shouldSeeRailItems(railWith());
      await alice.shouldSeeRailInboxHighlighted();
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Promote sheet — process listId [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-5-process-list@example.com');
    });

    it('processes a capture onto a named list', async () => {
      const list = await alice.createNamedList('Groceries');
      const capture = await alice.createCapture({ content: 'Buy milk' });

      const task = await alice.processCaptureToTask(capture.id, { listId: list.id });

      expect(task.listId).toBe(list.id);
      const onList = await alice.listOpenTasksOnList(list.id);
      expect(onList.map((item) => item.id)).toContain(task.id);

      const inbox = await alice.listCaptures();
      expect(inbox.some((item) => item.id === capture.id)).toBe(false);
    });

    it('processes a capture as unlisted when listId is omitted', async () => {
      const capture = await alice.createCapture({ content: 'Loose thought' });

      const task = await alice.processCaptureToTask(capture.id);

      expect(task.listId).toBeUndefined();
      const unlisted = await alice.listUnlistedOpenTasks();
      expect(unlisted.map((item) => item.id)).toContain(task.id);
    });

    it('rejects an unknown list and leaves the capture in inbox', async () => {
      const capture = await alice.createCapture({ content: 'No such list' });

      await expect(
        alice.processCaptureToTask(capture.id, {
          listId: '550e8400-e29b-41d4-a716-446655440099',
        })
      ).rejects.toThrow(ValidationError);

      const still = await alice.getCapture(capture.id);
      expect(still.status).toBe('inbox');
    });
  });

  describe(`Promote sheet — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs promote-sheet operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-5-promote-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.openPromoteSheet('Promote me')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeePromoteSheet()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeePromoteTitlePrefill('Promote me')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeePromoteListUnlisted()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.confirmPromoteUnlisted()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.confirmPromoteOnList('Groceries')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.cancelPromoteSheet()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldNotSeeCaptureOnCurrentPane('Gone')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
