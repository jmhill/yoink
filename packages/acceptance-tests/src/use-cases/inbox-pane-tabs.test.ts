import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Yoink UI story 4: Inbox pane with Snoozed and Trash as tabs.
 *
 * Inbox holds captures, not tasks. Rail has one Inbox row (highlighted on
 * Inbox, Snoozed, and Trash). Snoozed and Trash are tabs on that pane,
 * ordered Inbox | Snoozed | Trash. Quick-add stays on the Inbox tab.
 * Promote still opens the existing modal. No new domain field or API.
 *
 * Out of scope: Promote sheet, Mine leftover, All retirement, mobile
 * redesign, drag, empty groups, bulk actions, inbox count rules.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

const tomorrow = (): string => new Date(Date.now() + 86_400_000).toISOString();

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Inbox pane tabs [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-4-inbox-pane@example.com');
    });

    it('opens the Inbox pane of captures from the rail, with Inbox first and the count badge', async () => {
      await alice.openRailInbox();
      await alice.shouldBeOnInboxPane();
      await alice.shouldSeeInboxPaneTabs(['Inbox', 'Snoozed', 'Trash']);
      await alice.shouldNotSeeSnoozedOrTrashOnRail();
      await alice.shouldSeeRailItems(railWith());
      await alice.shouldNotSeeInboxCountOnRail();

      await alice.createCapture({ content: 'Note one' });
      await alice.openRailInbox();
      await alice.shouldBeOnInboxPane();
      await alice.shouldSeeInboxCountOnRail(1);
    });

    it('shows snoozed and trashed captures on their tabs while rail Inbox stays highlighted', async () => {
      await alice.createCapture({ content: 'Stay' });
      const later = await alice.createCapture({ content: 'Later' });
      const gone = await alice.createCapture({ content: 'Gone' });
      await alice.snoozeCapture(later.id, tomorrow());
      await alice.trashCapture(gone.id);

      await alice.openRailInbox();
      await alice.shouldBeOnInboxPaneTab('inbox');
      await alice.shouldSeeCaptureOnCurrentPane('Stay');
      await alice.shouldSeeRailInboxHighlighted();
      await alice.shouldSeeInboxCountOnRail(1);

      await alice.openInboxPaneTab('snoozed');
      await alice.shouldBeOnInboxPaneTab('snoozed');
      await alice.shouldSeeCaptureOnCurrentPane('Later');
      await alice.shouldSeeRailInboxHighlighted();
      await alice.shouldNotSeeSnoozedOrTrashOnRail();

      await alice.openInboxPaneTab('trash');
      await alice.shouldBeOnInboxPaneTab('trash');
      await alice.shouldSeeCaptureOnCurrentPane('Gone');
      await alice.shouldSeeRailInboxHighlighted();
    });

    it('keeps Promote / Snooze / Trash on an inbox capture and has no checkbox, drag, or due date', async () => {
      await alice.createCapture({ content: 'Triage me' });

      await alice.openRailInbox();
      await alice.shouldSeeInboxCaptureActions('Triage me');
    });

    it('keeps quick-add on the Inbox tab and Promote as the existing modal', async () => {
      await alice.openRailInbox();
      await alice.shouldSeeQuickAddCapture();

      const capture = await alice.createCapture({ content: 'Promote me' });
      expect(capture.content).toBe('Promote me');
      await alice.shouldSeeCaptureOnCurrentPane('Promote me');

      await alice.openExistingPromoteModal('Promote me');
      await alice.shouldSeeExistingPromoteModal();

      await alice.openInboxPaneTab('snoozed');
      await alice.shouldNotSeeQuickAddCapture();
      await alice.openInboxPaneTab('trash');
      await alice.shouldNotSeeQuickAddCapture();
    });

    it('keeps named-list, Unlisted, smart-view, New list, and rail-delete working', async () => {
      const list = await alice.createNamedListFromRail('Groceries');
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeRailItems(railWith('Groceries'));

      await alice.addTaskOnCurrentView('Milk');
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.openRailUnlisted();
      await alice.shouldBeOnAllUnlistedPile();
      await alice.shouldSeeAddTaskField();

      await alice.openRailSmartView('today');
      await alice.shouldBeOnTaskFilter('today');

      await alice.createNamedListFromRail('Weekend');
      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldSeeRailItems(railWith('Groceries'));
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Inbox pane tabs — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs inbox-pane operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-4-inbox-pane-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.openRailInbox()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldBeOnInboxPane()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeInboxPaneTabs(['Inbox', 'Snoozed', 'Trash'])).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldNotSeeSnoozedOrTrashOnRail()).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.openInboxPaneTab('snoozed')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldBeOnInboxPaneTab('trash')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeRailInboxHighlighted()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeCaptureOnCurrentPane('Later')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeInboxCaptureActions('Triage me')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeQuickAddCapture()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldNotSeeQuickAddCapture()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.openExistingPromoteModal('Promote me')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeExistingPromoteModal()).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
