import type {
  Capture,
  Task,
  CreateCaptureInput,
  UpdateCaptureInput,
  CreateTaskInput,
  UpdateTaskInput,
  ProcessCaptureToTaskInput,
} from './types.js';

/**
 * Core actor operations available in all drivers (HTTP and browser).
 * These are the fundamental capture management operations.
 */
export type CoreActor = {
  // Identity
  readonly email: string;
  readonly userId: string;
  readonly organizationId: string;

  // Capture operations
  createCapture(input: CreateCaptureInput): Promise<Capture>;
  listCaptures(): Promise<Capture[]>;
  listTrashedCaptures(): Promise<Capture[]>;
  getCapture(id: string): Promise<Capture>;
  updateCapture(id: string, input: UpdateCaptureInput): Promise<Capture>;
  trashCapture(id: string): Promise<Capture>;
  restoreCapture(id: string): Promise<Capture>;
  snoozeCapture(id: string, until: string): Promise<Capture>;
  unsnoozeCapture(id: string): Promise<Capture>;
  listSnoozedCaptures(): Promise<Capture[]>;
  deleteCapture(id: string): Promise<void>;
  emptyTrash(): Promise<{ deletedCount: number }>;

  // Process capture to task
  processCaptureToTask(captureId: string, input?: ProcessCaptureToTaskInput): Promise<Task>;

  // Task operations
  createTask(input: CreateTaskInput): Promise<Task>;
  listTasks(filter?: 'today' | 'upcoming' | 'all' | 'completed'): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput): Promise<Task>;
  completeTask(id: string): Promise<Task>;
  uncompleteTask(id: string): Promise<Task>;
  pinTask(id: string): Promise<Task>;
  unpinTask(id: string): Promise<Task>;
  deleteTask(id: string): Promise<void>;
};

/**
 * Browser-specific operations only available in Playwright driver.
 * These require a real browser context to function.
 */
export type BrowserActorOperations = {
  /**
   * Navigate to the settings page.
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
   */
  requiresConfiguration(): Promise<boolean>;

  /**
   * Simulate sharing content via the share target (PWA share intent).
   * Opens the /share route with the provided parameters.
   */
  shareContent(params: { text?: string; url?: string; title?: string }): Promise<Capture>;

  /**
   * Simulate going offline.
   */
  goOffline(): Promise<void>;

  /**
   * Simulate coming back online.
   */
  goOnline(): Promise<void>;

  /**
   * Check if the user sees a warning about being offline.
   * Returns true when the app is displaying offline status to the user.
   */
  seesOfflineWarning(): Promise<boolean>;

  /**
   * Check if the user can add new captures.
   * Returns false when the app prevents capture creation (e.g., when offline).
   */
  canAddCaptures(): Promise<boolean>;
};

/**
 * Browser actor with all operations (core + browser-specific).
 * Only returned by the Playwright driver.
 */
export type BrowserActor = CoreActor & BrowserActorOperations;

/**
 * Full Actor interface (union of all capabilities).
 * Kept for backwards compatibility - existing tests use this type.
 *
 * @deprecated Use CoreActor for multi-driver tests, BrowserActor for browser-only tests
 */
export type Actor = BrowserActor;

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
