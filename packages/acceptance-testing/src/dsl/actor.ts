import type {
  Capture,
  Task,
  PasskeyCredentialInfo,
  Member,
  Invitation,
  Token,
  CreateTokenResult,
  CreateCaptureInput,
  UpdateCaptureInput,
  CreateTaskInput,
  UpdateTaskInput,
  ProcessCaptureToTaskInput,
  CreateInvitationInput,
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

  // Passkey operations
  /**
   * Register a new passkey for this user.
   * HTTP driver mocks the WebAuthn response internally.
   * Playwright driver uses CDP virtual authenticator.
   */
  registerPasskey(name?: string): Promise<PasskeyCredentialInfo>;

  /**
   * List all passkeys for this user.
   */
  listPasskeys(): Promise<PasskeyCredentialInfo[]>;

  /**
   * Delete a passkey by ID.
   * Throws CannotDeleteLastPasskeyError if this is the user's only passkey.
   */
  deletePasskey(credentialId: string): Promise<void>;

  // ==========================================================================
  // API Token Self-Service
  // ==========================================================================

  /**
   * List all API tokens for this user in the current organization.
   */
  listTokens(): Promise<Token[]>;

  /**
   * Create a new API token for this user in the current organization.
   * Returns the token info and the raw token value (shown only once).
   * @throws TokenLimitReachedError if user has reached the max tokens (2 per org)
   */
  createToken(name: string): Promise<CreateTokenResult>;

  /**
   * Revoke (delete) an API token by ID.
   * Only the token owner can revoke their own tokens.
   * @throws NotFoundError if token does not exist
   * @throws ForbiddenError if user does not own the token
   */
  revokeToken(tokenId: string): Promise<void>;

  /**
   * Get current session info.
   * Returns user info and current organization.
   */
  getSessionInfo(): Promise<{
    user: { id: string; email: string };
    organizationId: string;
    organizations: Array<{
      id: string;
      name: string;
      isPersonal: boolean;
      role: 'owner' | 'admin' | 'member';
    }>;
  }>;
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
   * Switch to a different organization.
   * Only works with session auth (not token auth).
   * Reloads the page after switching.
   */
  switchOrganization(organizationId: string): Promise<void>;

  /**
   * Leave an organization.
   * Only works with session auth (not token auth).
   * If leaving the current org, switches to personal org first.
   * Reloads the page after leaving.
   * @throws CannotLeavePersonalOrgError if trying to leave personal org
   * @throws LastAdminError if user is the last admin
   */
  leaveOrganization(organizationId: string): Promise<void>;

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
   * Assert that the offline warning banner is visible.
   * Uses Playwright's auto-retry to wait for the banner to appear.
   */
  shouldSeeOfflineWarning(): Promise<void>;

  /**
   * Assert that the offline warning banner is not visible.
   * Uses Playwright's auto-retry to wait for the banner to disappear.
   */
  shouldNotSeeOfflineWarning(): Promise<void>;

  /**
   * Assert that the user can add new captures (input is enabled).
   * Uses Playwright's auto-retry to wait for the input to be enabled.
   */
  shouldBeAbleToAddCaptures(): Promise<void>;

  /**
   * Assert that the user cannot add new captures (input is disabled/offline).
   * Uses Playwright's auto-retry to wait for the offline state.
   */
  shouldNotBeAbleToAddCaptures(): Promise<void>;

  // ==========================================================================
  // Organization Member Management
  // ==========================================================================

  /**
   * List all members of the current organization.
   * All members can view the member list.
   */
  listMembers(): Promise<Member[]>;

  /**
   * Remove a member from the current organization.
   * - Admins can remove members
   * - Owners can remove admins and members
   * - Cannot remove self (use leaveOrganization instead)
   * - Cannot remove the last owner
   * @throws ForbiddenError if insufficient permissions
   * @throws CannotRemoveSelfError if trying to remove self
   * @throws LastAdminError if removing the last admin/owner
   */
  removeMember(userId: string): Promise<void>;

  // ==========================================================================
  // Invitation Management
  // ==========================================================================

  /**
   * Create an invitation to the current organization.
   * Only admins and owners can create invitations.
   * @throws ForbiddenError if user is not admin/owner
   */
  createInvitation(input?: CreateInvitationInput): Promise<Invitation>;

  /**
   * List pending invitations for the current organization.
   * Only admins and owners can view pending invitations.
   * @throws ForbiddenError if user is not admin/owner
   */
  listPendingInvitations(): Promise<Invitation[]>;

  /**
   * Revoke a pending invitation.
   * Only admins and owners can revoke invitations.
   * @throws ForbiddenError if user is not admin/owner
   * @throws NotFoundError if invitation does not exist
   */
  revokeInvitation(invitationId: string): Promise<void>;
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
