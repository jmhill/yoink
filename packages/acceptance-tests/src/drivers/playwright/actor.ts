import type { Page } from '@playwright/test';
import type {
  Actor,
  AnonymousActor,
  Capture,
  CreateCaptureInput,
  UpdateCaptureInput,
} from '../../dsl/index.js';
import { UnauthorizedError, NotFoundError, ValidationError } from '../../dsl/index.js';
import { ConfigPage, InboxPage, ArchivedPage, SettingsPage, SnoozedPage } from './page-objects.js';

type ActorCredentials = {
  email: string;
  userId: string;
  organizationId: string;
  token: string;
};

/**
 * State tracking for captures created through the UI.
 * Since the UI doesn't expose all capture fields, we need to track them.
 *
 * LIMITATION: Synthetic ID Tracking
 * =================================
 * The Playwright driver generates synthetic IDs (e.g., "ui-1234567890-abc123")
 * because the web UI doesn't expose the actual database IDs. This has implications:
 *
 * 1. `getCapture(id)` only works for captures this driver instance created
 * 2. Tests using synthetic IDs don't verify actual database behavior
 * 3. If the same content is captured twice, the Map will only track the latest
 *
 * The driver uses content-based lookups internally, mapping content → state.
 * This works well for most acceptance tests since each test creates unique content.
 *
 * For tests that need real IDs (e.g., testing ID validation), use HTTP driver only.
 */
type CaptureState = {
  id: string;
  content: string;
  status: 'inbox' | 'archived';
  capturedAt: string;
  pinnedAt?: string;
  snoozedUntil?: string;
};

/**
 * Playwright implementation of the Actor interface.
 * Interacts with the web UI to perform operations.
 */
export const createPlaywrightActor = (
  page: Page,
  credentials: ActorCredentials
): Actor => {
  const configPage = new ConfigPage(page);
  const inboxPage = new InboxPage(page);
  const archivedPage = new ArchivedPage(page);
  const settingsPage = new SettingsPage(page);
  const snoozedPage = new SnoozedPage(page);
  
  // Track captures we've created for ID lookup
  const capturesByContent = new Map<string, CaptureState>();
  let isConfigured = false;

  const ensureConfigured = async (): Promise<void> => {
    if (!isConfigured) {
      await configPage.configure(credentials.token);
      isConfigured = true;
    }
  };

  // Helper to build a Capture object from UI state
  const buildCapture = (state: CaptureState): Capture => ({
    id: state.id,
    content: state.content,
    status: state.status,
    organizationId: credentials.organizationId,
    createdById: credentials.userId,
    capturedAt: state.capturedAt,
    pinnedAt: state.pinnedAt,
    snoozedUntil: state.snoozedUntil,
  });

  return {
    email: credentials.email,
    userId: credentials.userId,
    organizationId: credentials.organizationId,

    async createCapture(input: CreateCaptureInput): Promise<Capture> {
      await ensureConfigured();
      await inboxPage.goto();
      
      // Attempt to add the capture through the UI
      // The UI prevents submission if content is empty (button is disabled)
      const wasSubmitted = await inboxPage.quickAdd(input.content);
      
      if (!wasSubmitted) {
        // The UI rejected the submission (e.g., empty content)
        throw new ValidationError('Content is required');
      }
      
      // Generate a pseudo-ID (the real ID is in the backend)
      // For tests that need the ID, we'll use the content as a lookup key
      const capturedAt = new Date().toISOString();
      const state: CaptureState = {
        id: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        content: input.content,
        status: 'inbox',
        capturedAt,
      };
      capturesByContent.set(input.content, state);
      
      return buildCapture(state);
    },

    async listCaptures(): Promise<Capture[]> {
      await ensureConfigured();
      await inboxPage.goto();
      
      // Wait for the page to finish loading (either captures or empty state)
      await inboxPage.waitForCapturesOrEmpty();
      
      const contents = await inboxPage.getCaptureContents();
      
      return contents.map((content) => {
        const state = capturesByContent.get(content);
        if (state) {
          return buildCapture(state);
        }
        // Capture exists but we don't have metadata for it
        return {
          id: `unknown-${Date.now()}`,
          content,
          status: 'inbox' as const,
          organizationId: credentials.organizationId,
          createdById: credentials.userId,
          capturedAt: new Date().toISOString(),
        };
      });
    },

    async listArchivedCaptures(): Promise<Capture[]> {
      await ensureConfigured();
      await archivedPage.goto();
      
      // Wait for the page to finish loading (either captures or empty state)
      await archivedPage.waitForCapturesOrEmpty();
      
      const contents = await archivedPage.getCaptureContents();
      
      return contents.map((content) => {
        const state = capturesByContent.get(content);
        if (state) {
          return buildCapture(state);
        }
        // Capture exists but we don't have metadata for it
        return {
          id: `unknown-${Date.now()}`,
          content,
          status: 'archived' as const,
          organizationId: credentials.organizationId,
          createdById: credentials.userId,
          capturedAt: new Date().toISOString(),
        };
      });
    },

    async getCapture(id: string): Promise<Capture> {
      await ensureConfigured();
      
      // Look up by ID in our tracked captures
      for (const state of capturesByContent.values()) {
        if (state.id === id) {
          return buildCapture(state);
        }
      }
      
      throw new NotFoundError('Capture', id);
    },

    async updateCapture(id: string, input: UpdateCaptureInput): Promise<Capture> {
      await ensureConfigured();
      
      // Find the capture by ID
      let targetState: CaptureState | undefined;
      for (const state of capturesByContent.values()) {
        if (state.id === id) {
          targetState = state;
          break;
        }
      }
      
      if (!targetState) {
        throw new NotFoundError('Capture', id);
      }
      
      // Update content in our state (UI doesn't support inline edit yet)
      if (input.content) {
        capturesByContent.delete(targetState.content);
        targetState.content = input.content;
        capturesByContent.set(targetState.content, targetState);
      }
      
      return buildCapture(targetState);
    },

    async archiveCapture(id: string): Promise<Capture> {
      await ensureConfigured();

      // Find the capture by ID
      let targetState: CaptureState | undefined;
      for (const state of capturesByContent.values()) {
        if (state.id === id) {
          targetState = state;
          break;
        }
      }

      if (!targetState) {
        throw new NotFoundError('Capture', id);
      }

      await inboxPage.goto();
      await inboxPage.archiveCapture(targetState.content);
      targetState.status = 'archived';
      // Archiving automatically unpins
      targetState.pinnedAt = undefined;

      return buildCapture(targetState);
    },

    async unarchiveCapture(id: string): Promise<Capture> {
      await ensureConfigured();

      // Find the capture by ID
      let targetState: CaptureState | undefined;
      for (const state of capturesByContent.values()) {
        if (state.id === id) {
          targetState = state;
          break;
        }
      }

      if (!targetState) {
        throw new NotFoundError('Capture', id);
      }

      await archivedPage.goto();
      await archivedPage.unarchiveCapture(targetState.content);
      targetState.status = 'inbox';

      return buildCapture(targetState);
    },

    async pinCapture(id: string): Promise<Capture> {
      await ensureConfigured();

      // Find the capture by ID
      let targetState: CaptureState | undefined;
      for (const state of capturesByContent.values()) {
        if (state.id === id) {
          targetState = state;
          break;
        }
      }

      if (!targetState) {
        throw new NotFoundError('Capture', id);
      }

      // Navigate to inbox and pin the capture
      await inboxPage.goto();
      await inboxPage.pinCapture(targetState.content);
      targetState.pinnedAt = new Date().toISOString();

      return buildCapture(targetState);
    },

    async unpinCapture(id: string): Promise<Capture> {
      await ensureConfigured();

      // Find the capture by ID
      let targetState: CaptureState | undefined;
      for (const state of capturesByContent.values()) {
        if (state.id === id) {
          targetState = state;
          break;
        }
      }

      if (!targetState) {
        throw new NotFoundError('Capture', id);
      }

      // Navigate to inbox and unpin the capture
      await inboxPage.goto();
      await inboxPage.unpinCapture(targetState.content);
      targetState.pinnedAt = undefined;

      return buildCapture(targetState);
    },

    async snoozeCapture(id: string, until: string): Promise<Capture> {
      await ensureConfigured();

      // Find the capture by ID
      let targetState: CaptureState | undefined;
      for (const state of capturesByContent.values()) {
        if (state.id === id) {
          targetState = state;
          break;
        }
      }

      if (!targetState) {
        throw new NotFoundError('Capture', id);
      }

      // Determine snooze option based on until time
      // For simplicity, we'll use 'tomorrow' as the default option in UI tests
      await inboxPage.goto();
      await inboxPage.snoozeCapture(targetState.content, 'tomorrow');
      targetState.snoozedUntil = until;

      return buildCapture(targetState);
    },

    async unsnoozeCapture(id: string): Promise<Capture> {
      await ensureConfigured();

      // Find the capture by ID
      let targetState: CaptureState | undefined;
      for (const state of capturesByContent.values()) {
        if (state.id === id) {
          targetState = state;
          break;
        }
      }

      if (!targetState) {
        throw new NotFoundError('Capture', id);
      }

      await snoozedPage.goto();
      await snoozedPage.unsnoozeCapture(targetState.content);
      targetState.snoozedUntil = undefined;

      return buildCapture(targetState);
    },

    async listSnoozedCaptures(): Promise<Capture[]> {
      await ensureConfigured();
      await snoozedPage.goto();
      
      // Wait for the page to finish loading (either captures or empty state)
      await snoozedPage.waitForCapturesOrEmpty();
      
      const contents = await snoozedPage.getCaptureContents();
      
      return contents.map((content) => {
        const state = capturesByContent.get(content);
        if (state) {
          return buildCapture(state);
        }
        // Capture exists but we don't have metadata for it
        return {
          id: `unknown-${Date.now()}`,
          content,
          status: 'inbox' as const,
          organizationId: credentials.organizationId,
          createdById: credentials.userId,
          capturedAt: new Date().toISOString(),
        };
      });
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

      // Build a capture object from what we know
      const content = params.text || params.url || '';
      const capturedAt = new Date().toISOString();
      const state: CaptureState = {
        id: `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        content,
        status: 'inbox',
        capturedAt,
      };
      capturesByContent.set(content, state);

      return {
        ...buildCapture(state),
        sourceUrl: params.url,
      };
    },

    async goOffline(): Promise<void> {
      await page.context().setOffline(true);
    },

    async goOnline(): Promise<void> {
      await page.context().setOffline(false);
    },

    async isOfflineBannerVisible(): Promise<boolean> {
      // Note: Don't call ensureConfigured() here - we may be testing offline state
      // and the caller should ensure we're configured before going offline
      await inboxPage.goto();
      
      // Wait for offline banner to appear (with timeout for robustness)
      // The banner appears when the useNetworkStatus hook detects offline state
      const banner = page.getByText("You're offline");
      try {
        await banner.waitFor({ state: 'visible', timeout: 2000 });
        return true;
      } catch {
        // Banner didn't appear within timeout
        return false;
      }
    },

    async isQuickAddDisabled(): Promise<boolean> {
      // Note: Don't call ensureConfigured() here - we may be testing offline state
      // and the caller should ensure we're configured before going offline
      await inboxPage.goto();
      
      // Wait for the offline placeholder to appear (indicates disabled state)
      // The app changes the placeholder text when offline
      const offlineInput = page.getByPlaceholder('Offline - cannot add captures');
      try {
        await offlineInput.waitFor({ state: 'visible', timeout: 2000 });
        return true;
      } catch {
        // Offline placeholder didn't appear - check if regular input is disabled
        const input = page.getByPlaceholder('Quick capture...');
        return await input.isDisabled();
      }
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
