import type { Capture, CreateCaptureInput, UpdateCaptureInput } from './types.js';

/**
 * Represents an authenticated user performing actions.
 * All operations are scoped to this user's identity and permissions.
 *
 * This is the primary interface for user-facing acceptance tests.
 * Tests should read like: "alice.createCapture(...)" or "bob.listCaptures()"
 */
export type Actor = {
  // Identity
  readonly email: string;
  readonly userId: string;
  readonly organizationId: string;

  // Capture operations
  createCapture(input: CreateCaptureInput): Promise<Capture>;
  listCaptures(): Promise<Capture[]>;
  listArchivedCaptures(): Promise<Capture[]>;
  getCapture(id: string): Promise<Capture>;
  updateCapture(id: string, input: UpdateCaptureInput): Promise<Capture>;
  archiveCapture(id: string): Promise<Capture>;
  unarchiveCapture(id: string): Promise<Capture>;
  pinCapture(id: string): Promise<Capture>;
  unpinCapture(id: string): Promise<Capture>;

  // Session operations
  /**
   * Navigate to the settings page.
   * Only available in browser-based drivers.
   */
  goToSettings(): Promise<void>;

  /**
   * Log out of the current session.
   * Clears credentials and returns to unconfigured state.
   */
  logout(): Promise<void>;

  /**
   * Check if the session requires (re)configuration.
   * Returns true if the app redirects to /config when trying to access inbox.
   * Only available in browser-based drivers.
   */
  requiresConfiguration(): Promise<boolean>;

  /**
   * Simulate sharing content via the share target (PWA share intent).
   * Opens the /share route with the provided parameters.
   * Only available in browser-based drivers.
   */
  shareContent(params: { text?: string; url?: string; title?: string }): Promise<Capture>;

  /**
   * Simulate going offline.
   * Only available in browser-based drivers.
   */
  goOffline(): Promise<void>;

  /**
   * Simulate coming back online.
   * Only available in browser-based drivers.
   */
  goOnline(): Promise<void>;

  /**
   * Check if the offline banner is visible.
   * Only available in browser-based drivers.
   */
  isOfflineBannerVisible(): Promise<boolean>;

  /**
   * Check if the quick-add input is disabled.
   * Only available in browser-based drivers.
   */
  isQuickAddDisabled(): Promise<boolean>;
};

/**
 * Represents an unauthenticated user attempting actions.
 * All operations should throw UnauthorizedError.
 *
 * Used to test that authentication is properly enforced.
 */
export type AnonymousActor = {
  createCapture(input: CreateCaptureInput): Promise<Capture>;
  listCaptures(): Promise<Capture[]>;
  getCapture(id: string): Promise<Capture>;
};
