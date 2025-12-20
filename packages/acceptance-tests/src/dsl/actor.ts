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
  getCapture(id: string): Promise<Capture>;
  updateCapture(id: string, input: UpdateCaptureInput): Promise<Capture>;
  archiveCapture(id: string): Promise<Capture>;
  unarchiveCapture(id: string): Promise<Capture>;

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
