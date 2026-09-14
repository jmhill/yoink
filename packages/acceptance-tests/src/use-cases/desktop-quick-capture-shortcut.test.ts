import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #101: Desktop keyboard shortcut for quick capture into Inbox.
 *
 * Product lock: desktop (md+) ⌘K / Ctrl+K focuses or opens the Inbox
 * capture field from anywhere in the app, including task screens.
 * Mobile keeps the on-pane field and has no shortcut chrome.
 * Hint uses theme tokens. Promote / lifecycle unchanged.
 *
 * Out of scope: Android share / Chrome extension, capture card density
 * (#99), rail split (#100), renaming Promote, pane warm triage (#98).
 */

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Desktop quick-capture shortcut [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-23-quick-capture-shortcut@example.com');
    });

    it('on desktop, the shortcut focuses quick capture and a typed note lands in Inbox — including from Today', async () => {
      await alice.useDesktopViewport();

      await alice.openRailInbox();
      await alice.shouldSeeQuickAddCapture();
      await alice.shouldSeeQuickCaptureShortcutHint();
      await alice.pressQuickCaptureShortcut();
      await alice.shouldHaveQuickCaptureFocused();
      await alice.submitFocusedQuickCapture('From inbox shortcut');
      await alice.shouldSeeCaptureOnCurrentPane('From inbox shortcut');

      await alice.openToday();
      await alice.shouldSeeTaskSurface();
      await alice.shouldNotSeeQuickAddCapture();
      await alice.pressQuickCaptureShortcut();
      await alice.shouldHaveQuickCaptureFocused();
      await alice.submitFocusedQuickCapture('From today shortcut');
      await alice.shouldSeeCaptureOnCurrentPane('From today shortcut');
      await alice.shouldSeeCaptureOnCurrentPane('From inbox shortcut');
    });

    it('does not break typing in the add-task field or an edit modal', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const task = await alice.createTask({ title: 'Existing task', dueDate: today });
      await alice.useDesktopViewport();

      await alice.openToday();
      await alice.shouldSeeAddTaskField();
      await alice.shouldSeeTaskSurface();
      await alice.focusAddTaskField();
      await alice.typeIntoFocusedField('Buy milk');
      await alice.pressQuickCaptureShortcut();
      await alice.shouldBeOnToday();
      await alice.shouldSeeFocusedFieldValue('Buy milk');
      await alice.typeIntoFocusedField(' and eggs');
      await alice.shouldSeeFocusedFieldValue('Buy milk and eggs');
      await alice.shouldSeeTaskSurface();

      await alice.openTaskEditFromRow(task.id);
      await alice.shouldSeeExistingTaskEditUi();
      await alice.focusTaskEditTitle();
      await alice.typeIntoFocusedField(' — keep typing');
      await alice.pressQuickCaptureShortcut();
      await alice.shouldSeeExistingTaskEditUi();
      await alice.shouldSeeFocusedFieldValue('Existing task — keep typing');
      await alice.closeTaskEdit();
      await alice.shouldBeOnToday();
    });

    it('leaves mobile capture as the on-pane field with no shortcut', async () => {
      await alice.useMobileViewport();

      await alice.openMobileBottomTab('inbox');
      await alice.shouldSeeQuickAddCapture();
      await alice.shouldNotSeeQuickCaptureShortcutHint();
      await alice.createCapture({ content: 'Typed on the phone field' });
      await alice.shouldSeeCaptureOnCurrentPane('Typed on the phone field');

      await alice.openMobileBottomTab('tasks');
      await alice.shouldSeeTaskSurface();
      await alice.shouldNotSeeQuickAddCapture();
      await alice.pressQuickCaptureShortcut();
      await alice.shouldSeeTaskSurface();
      await alice.shouldNotSeeQuickAddCapture();
    });

    it('keeps the shortcut hint readable in light, dark, and tokyo night', async () => {
      const appearances = [
        { mode: 'light' as const, colorTheme: 'default' as const },
        { mode: 'dark' as const, colorTheme: 'default' as const },
        { mode: 'light' as const, colorTheme: 'tokyo-night' as const },
        { mode: 'dark' as const, colorTheme: 'tokyo-night' as const },
      ];

      for (const appearance of appearances) {
        await alice.useAppearance(appearance);
        await alice.useDesktopViewport();
        await alice.openRailInbox();
        await alice.shouldSeeQuickCaptureShortcutHint();
        await alice.shouldSeeQuickCaptureShortcutHintReadable();
      }
    }, 90_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Desktop quick-capture shortcut — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs shortcut operations as browser-only', async () => {
      const alice = await ctx.createActor(
        'alice-ui-story-23-quick-capture-shortcut-http@example.com'
      );
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.pressQuickCaptureShortcut()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeQuickCaptureShortcutHint()).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldHaveQuickCaptureFocused()).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
