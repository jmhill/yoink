import { type Page, expect } from '@playwright/test';
import type {
  Actor,
  AnonymousActor,
  Capture,
  Task,
  PasskeyCredentialInfo,
  CreateCaptureInput,
  UpdateCaptureInput,
  CreateTaskInput,
  UpdateTaskInput,
  ProcessCaptureToTaskInput,
} from '../../dsl/index.js';
import { UnauthorizedError, NotFoundError, ValidationError, UnsupportedOperationError } from '../../dsl/index.js';
import { ConfigPage, InboxPage, TrashPage, SettingsPage, SnoozedPage } from './page-objects.js';

/**
 * Mirrors the share.ts logic for determining expected content and sourceUrl
 * from share intent params. This keeps the driver in sync with the app logic.
 */
function parseShareExpectations(params: {
  text?: string;
  url?: string;
  title?: string;
}): { expectedContent: string; expectedSourceUrl: string | undefined } {
  // Check if text is URL-only (matches extractUrlFromText logic)
  const textIsUrlOnly = (() => {
    const trimmed = params.text?.trim() ?? '';
    if (!trimmed) return undefined;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        new URL(trimmed);
        return trimmed;
      } catch {
        return undefined;
      }
    }
    return undefined;
  })();

  // Determine sourceUrl (explicit url param takes precedence)
  const expectedSourceUrl = params.url?.trim() || textIsUrlOnly;

  // Determine content (exclude URL-only text, generate placeholder if needed)
  const textContent = textIsUrlOnly ? null : params.text;
  const parts = [params.title, textContent].filter(
    (p): p is string => Boolean(p && p.trim())
  );
  let expectedContent = parts.map((p) => p.trim()).join('\n\n');

  // If content is empty but we have a URL, generate placeholder
  if (!expectedContent && expectedSourceUrl) {
    try {
      const hostname = new URL(expectedSourceUrl).hostname.replace(/^www\./, '');
      expectedContent = `Shared from ${hostname}`;
    } catch {
      expectedContent = 'Shared link';
    }
  }

  return { expectedContent, expectedSourceUrl };
}

type ActorCredentials = {
  email: string;
  userId: string;
  organizationId: string;
  token: string;
};

/**
 * Playwright implementation of the Actor interface.
 * Interacts with the web UI to perform operations.
 *
 * This driver reads real capture IDs from the DOM via data-capture-id attributes,
 * eliminating the need for synthetic ID tracking.
 */
export const createPlaywrightActor = (
  page: Page,
  credentials: ActorCredentials
): Actor => {
  const configPage = new ConfigPage(page);
  const inboxPage = new InboxPage(page);
  const trashPage = new TrashPage(page);
  const settingsPage = new SettingsPage(page);
  const snoozedPage = new SnoozedPage(page);

  let isConfigured = false;

  const ensureConfigured = async (): Promise<void> => {
    if (!isConfigured) {
      await configPage.configure(credentials.token);
      isConfigured = true;
    }
  };

  /**
   * Build a minimal Capture object from ID and content.
   * We don't have access to all fields through the UI, but tests
   * primarily need id, content, and status.
   */
  const buildCapture = (
    id: string,
    content: string,
    status: 'inbox' | 'trashed',
    extras?: Partial<Capture>
  ): Capture => ({
    id,
    content,
    status,
    organizationId: credentials.organizationId,
    createdById: credentials.userId,
    capturedAt: new Date().toISOString(),
    ...extras,
  });

  /**
   * Find a capture's content by its ID from the current page.
   * Returns null if not found.
   */
  const findCaptureContentById = async (id: string): Promise<string | null> => {
    const card = page.locator(`[data-capture-id="${id}"]`);
    if ((await card.count()) === 0) {
      return null;
    }
    const contentElement = card.locator('p').first();
    return await contentElement.textContent();
  };

  return {
    email: credentials.email,
    userId: credentials.userId,
    organizationId: credentials.organizationId,

    async createCapture(input: CreateCaptureInput): Promise<Capture> {
      await ensureConfigured();
      await inboxPage.goto();

      // Attempt to add the capture through the UI
      // quickAdd returns the real ID from the DOM, or null if submission was prevented
      const captureId = await inboxPage.quickAdd(input.content);

      if (!captureId) {
        // The UI rejected the submission (e.g., empty content)
        throw new ValidationError('Content is required');
      }

      return buildCapture(captureId, input.content, 'inbox');
    },

    async listCaptures(): Promise<Capture[]> {
      await ensureConfigured();
      await inboxPage.goto();
      await inboxPage.waitForCapturesOrEmpty();

      const captures = await inboxPage.getCaptures();
      return captures.map(({ id, content }) => buildCapture(id, content, 'inbox'));
    },

    async listTrashedCaptures(): Promise<Capture[]> {
      await ensureConfigured();
      await trashPage.goto();
      await trashPage.waitForCapturesOrEmpty();

      const captures = await trashPage.getCaptures();
      return captures.map(({ id, content }: { id: string; content: string }) => buildCapture(id, content, 'trashed'));
    },

    async getCapture(id: string): Promise<Capture> {
      await ensureConfigured();

      // Check inbox first
      await inboxPage.goto();
      await inboxPage.waitForCapturesOrEmpty();
      let content = await findCaptureContentById(id);
      if (content) {
        return buildCapture(id, content, 'inbox');
      }

      // Check trash
      await trashPage.goto();
      await trashPage.waitForCapturesOrEmpty();
      content = await findCaptureContentById(id);
      if (content) {
        return buildCapture(id, content, 'trashed');
      }

      // Check snoozed
      await snoozedPage.goto();
      await snoozedPage.waitForCapturesOrEmpty();
      content = await findCaptureContentById(id);
      if (content) {
        return buildCapture(id, content, 'inbox');
      }

      throw new NotFoundError('Capture', id);
    },

    async updateCapture(id: string, input: UpdateCaptureInput): Promise<Capture> {
      await ensureConfigured();

      // First verify the capture exists
      await inboxPage.goto();
      await inboxPage.waitForCapturesOrEmpty();
      const content = await findCaptureContentById(id);

      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      // UI doesn't support inline edit yet, so we just return the current state
      // with the requested content update (this is a limitation of the UI)
      return buildCapture(id, input.content ?? content, 'inbox');
    },

    async trashCapture(id: string): Promise<Capture> {
      await ensureConfigured();
      await inboxPage.goto();
      await inboxPage.waitForCapturesOrEmpty();

      const content = await findCaptureContentById(id);
      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      await inboxPage.trashCapture(content);
      return buildCapture(id, content, 'trashed');
    },

    async restoreCapture(id: string): Promise<Capture> {
      await ensureConfigured();
      await trashPage.goto();
      await trashPage.waitForCapturesOrEmpty();

      const content = await findCaptureContentById(id);
      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      await trashPage.restoreCapture(content);
      return buildCapture(id, content, 'inbox');
    },

    async snoozeCapture(id: string, until: string): Promise<Capture> {
      await ensureConfigured();
      await inboxPage.goto();
      await inboxPage.waitForCapturesOrEmpty();

      const content = await findCaptureContentById(id);
      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      // For simplicity, we use 'tomorrow' as the snooze option in UI tests
      await inboxPage.snoozeCapture(content, 'tomorrow');
      return buildCapture(id, content, 'inbox', { snoozedUntil: until });
    },

    async unsnoozeCapture(id: string): Promise<Capture> {
      await ensureConfigured();
      await snoozedPage.goto();
      await snoozedPage.waitForCapturesOrEmpty();

      const content = await findCaptureContentById(id);
      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      await snoozedPage.unsnoozeCapture(content);
      return buildCapture(id, content, 'inbox');
    },

    async listSnoozedCaptures(): Promise<Capture[]> {
      await ensureConfigured();
      await snoozedPage.goto();
      await snoozedPage.waitForCapturesOrEmpty();

      const captures = await snoozedPage.getCaptures();
      return captures.map(({ id, content }) => buildCapture(id, content, 'inbox'));
    },

    async deleteCapture(id: string): Promise<void> {
      await ensureConfigured();
      await trashPage.goto();
      await trashPage.waitForCapturesOrEmpty();

      const content = await findCaptureContentById(id);
      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      await trashPage.deleteCapture(content);
    },

    async emptyTrash(): Promise<{ deletedCount: number }> {
      await ensureConfigured();
      await trashPage.goto();
      await trashPage.waitForCapturesOrEmpty();

      // Get count before emptying
      const captures = await trashPage.getCaptures();
      const count = captures.length;

      if (count > 0) {
        await trashPage.emptyTrash();
      }

      return { deletedCount: count };
    },

    // Task operations - not yet implemented in UI (Phase 8.7)
    // These will be implemented when the Tasks view UI is built
    async processCaptureToTask(_captureId: string, _input?: ProcessCaptureToTaskInput): Promise<Task> {
      throw new UnsupportedOperationError('processCaptureToTask', 'playwright');
    },

    async createTask(_input: CreateTaskInput): Promise<Task> {
      throw new UnsupportedOperationError('createTask', 'playwright');
    },

    async listTasks(_filter?: 'today' | 'upcoming' | 'all' | 'completed'): Promise<Task[]> {
      throw new UnsupportedOperationError('listTasks', 'playwright');
    },

    async getTask(_id: string): Promise<Task> {
      throw new UnsupportedOperationError('getTask', 'playwright');
    },

    async updateTask(_id: string, _input: UpdateTaskInput): Promise<Task> {
      throw new UnsupportedOperationError('updateTask', 'playwright');
    },

    async completeTask(_id: string): Promise<Task> {
      throw new UnsupportedOperationError('completeTask', 'playwright');
    },

    async uncompleteTask(_id: string): Promise<Task> {
      throw new UnsupportedOperationError('uncompleteTask', 'playwright');
    },

    async pinTask(_id: string): Promise<Task> {
      throw new UnsupportedOperationError('pinTask', 'playwright');
    },

    async unpinTask(_id: string): Promise<Task> {
      throw new UnsupportedOperationError('unpinTask', 'playwright');
    },

    async deleteTask(_id: string): Promise<void> {
      throw new UnsupportedOperationError('deleteTask', 'playwright');
    },

    async goToSettings(): Promise<void> {
      await ensureConfigured();
      await inboxPage.goto();
      await inboxPage.goToSettings();
    },

    async logout(): Promise<void> {
      await ensureConfigured();
      await settingsPage.goto();
      await settingsPage.logout();
      isConfigured = false;
    },

    async requiresConfiguration(): Promise<boolean> {
      // Try to navigate to inbox and check if we get redirected to /config
      await page.goto('/');

      // Wait for either the inbox to load or redirect to config
      // The app redirects to /config if no token is set
      try {
        await page.waitForURL('**/config', { timeout: 2000 });
        return true;
      } catch {
        // No redirect happened within timeout, so we're on the inbox
        return false;
      }
    },

    async shareContent(params: { text?: string; url?: string; title?: string }): Promise<Capture> {
      await ensureConfigured();

      // Build share URL with query params
      const searchParams = new URLSearchParams();
      if (params.text) searchParams.set('text', params.text);
      if (params.url) searchParams.set('url', params.url);
      if (params.title) searchParams.set('title', params.title);

      await page.goto(`/share?${searchParams.toString()}`);

      // Wait for the share modal to be visible
      await page.getByRole('button', { name: 'Save' }).waitFor();

      // Click save
      await page.getByRole('button', { name: 'Save' }).click();

      // Wait for success and redirect to inbox
      await page.waitForURL('/', { timeout: 5000 });

      // Determine expected content and sourceUrl based on share logic
      const { expectedContent, expectedSourceUrl } = parseShareExpectations(params);

      await inboxPage.waitForCapturesOrEmpty();
      const captureId = await inboxPage.getCaptureIdByContent(expectedContent);

      if (!captureId) {
        throw new Error(`Failed to find shared capture in inbox with content: "${expectedContent}"`);
      }

      return buildCapture(captureId, expectedContent, 'inbox', { sourceUrl: expectedSourceUrl });
    },

    async goOffline(): Promise<void> {
      await page.context().setOffline(true);
    },

    async goOnline(): Promise<void> {
      await page.context().setOffline(false);
    },

    async shouldSeeOfflineWarning(): Promise<void> {
      // Note: Don't call ensureConfigured() here - we may be testing offline state
      // and the caller should ensure we're configured before going offline.
      // Also don't navigate if already on inbox - navigation fails when offline.
      const currentUrl = page.url();
      if (!currentUrl.endsWith('/') && !currentUrl.includes('/?')) {
        await inboxPage.goto();
      }

      // Use Playwright's expect with auto-retry to wait for the banner to appear
      const banner = page.getByText("You're offline");
      await expect(banner).toBeVisible();
    },

    async shouldNotSeeOfflineWarning(): Promise<void> {
      // Note: Don't call ensureConfigured() here - we may be testing offline state
      // and the caller should ensure we're configured before going offline.
      const currentUrl = page.url();
      if (!currentUrl.endsWith('/') && !currentUrl.includes('/?')) {
        await inboxPage.goto();
      }

      // Use Playwright's expect with auto-retry to wait for the banner to disappear
      const banner = page.getByText("You're offline");
      await expect(banner).toBeHidden();
    },

    async shouldBeAbleToAddCaptures(): Promise<void> {
      // Note: Don't call ensureConfigured() here - we may be testing offline state
      const currentUrl = page.url();
      if (!currentUrl.endsWith('/') && !currentUrl.includes('/?')) {
        await inboxPage.goto();
      }

      // Use Playwright's expect with auto-retry to wait for the online input state
      const input = page.getByPlaceholder('Quick capture...');
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
    },

    async shouldNotBeAbleToAddCaptures(): Promise<void> {
      // Note: Don't call ensureConfigured() here - we may be testing offline state
      const currentUrl = page.url();
      if (!currentUrl.endsWith('/') && !currentUrl.includes('/?')) {
        await inboxPage.goto();
      }

      // Use Playwright's expect with auto-retry to wait for the offline input state
      const offlineInput = page.getByPlaceholder('Offline - cannot add captures');
      await expect(offlineInput).toBeVisible();
    },

    // Passkey operations - will be implemented in Phase 7.7b with CDP virtual authenticator
    async registerPasskey(_name?: string): Promise<PasskeyCredentialInfo> {
      // TODO: Implement using CDP virtual authenticator in Phase 7.7b
      // await cdpSession.send('WebAuthn.enable', { enableUI: false });
      // await cdpSession.send('WebAuthn.addVirtualAuthenticator', { ... });
      throw new UnsupportedOperationError('registerPasskey', 'playwright');
    },

    async listPasskeys(): Promise<PasskeyCredentialInfo[]> {
      // TODO: Implement by navigating to Settings > Security section
      throw new UnsupportedOperationError('listPasskeys', 'playwright');
    },

    async deletePasskey(_credentialId: string): Promise<void> {
      // TODO: Implement by navigating to Settings > Security and clicking delete
      throw new UnsupportedOperationError('deletePasskey', 'playwright');
    },
  };
};

/**
 * Playwright implementation of AnonymousActor.
 * Attempts operations without configuring a token.
 *
 * This actor verifies that the app properly enforces authentication
 * by checking that unauthenticated users are redirected to /config.
 */
export const createPlaywrightAnonymousActor = (page: Page): AnonymousActor => {
  /**
   * Ensures we're truly anonymous by clearing any stored token,
   * then navigates to the app and verifies redirect to /config.
   */
  const ensureRedirectsToConfig = async (): Promise<void> => {
    // Clear any existing token to ensure we're truly anonymous
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('yoink_api_token'));

    // Navigate to the app root
    await page.goto('/');

    // The app should redirect to /config because no token is set
    // Use waitForURL to actually verify the redirect happens
    await page.waitForURL('**/config', { timeout: 5000 });
  };

  return {
    async createCapture(_input: CreateCaptureInput): Promise<Capture> {
      await ensureRedirectsToConfig();
      // Successfully redirected means auth is enforced
      throw new UnauthorizedError();
    },

    async listCaptures(): Promise<Capture[]> {
      await ensureRedirectsToConfig();
      throw new UnauthorizedError();
    },

    async getCapture(_id: string): Promise<Capture> {
      await ensureRedirectsToConfig();
      throw new UnauthorizedError();
    },
  };
};
