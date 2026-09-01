import type {
  Capture,
  NamedList,
  Task,
  PasskeyCredentialInfo,
  Member,
  Invitation,
  Token,
  CreateTokenResult,
  CreateCaptureInput,
  UpdateCaptureInput,
  TaskFilter,
  CreateTaskInput,
  UpdateTaskInput,
  ProcessCaptureToTaskInput,
  CreateInvitationInput,
  AcceptInvitationResult,
  MintedAgent,
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

  // Named lists. createNamedList is the product write path (any org member).
  listNamedLists(): Promise<NamedList[]>;
  createNamedList(name: string): Promise<NamedList>;
  deleteNamedList(id: string): Promise<void>;
  listOpenTasksOnList(listId: string): Promise<Task[]>;
  reorderOpenTasksOnList(listId: string, taskIds: string[]): Promise<Task[]>;
  listUnlistedOpenTasks(): Promise<Task[]>;
  reorderUnlistedOpenTasks(taskIds: string[]): Promise<Task[]>;

  // Task operations
  createTask(input: CreateTaskInput): Promise<Task>;
  listTasks(filter?: TaskFilter): Promise<Task[]>;
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
   * Mint a token-only agent member in the current organization.
   * Owner/admin only. Returns the agent's API token once.
   */
  mintAgent(name: string): Promise<MintedAgent>;

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

  /**
   * List all members of the current organization.
   * Any org member (human or agent, token or session) can view the roster
   * so they have enough to pick a task assignee.
   */
  listMembers(): Promise<Member[]>;
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

  /**
   * Assert the task row shows this assignee name (member label: email or agent name).
   * Uses Playwright's auto-retry so the members list can resolve before the label appears.
   */
  shouldSeeAssigneeOnTask(taskId: string, assigneeLabel: string): Promise<void>;

  /**
   * Assert the task row has no assignee name.
   */
  shouldNotSeeAssigneeOnTask(taskId: string): Promise<void>;

  /**
   * Assert the task row shows this named list.
   */
  shouldSeeListOnTask(taskId: string, listName: string): Promise<void>;

  /**
   * Assert the task row has no named list.
   */
  shouldNotSeeListOnTask(taskId: string): Promise<void>;

  /**
   * Assert the Mine tab shows this task (assigned to the current principal).
   */
  shouldSeeTaskOnMine(taskId: string): Promise<void>;

  /**
   * Assert the Mine tab does not show this task.
   */
  shouldNotSeeTaskOnMine(taskId: string): Promise<void>;

  /**
   * Open the named lists view.
   */
  goToLists(): Promise<void>;

  /**
   * Assert the lists view is visible and has no named lists.
   */
  shouldSeeEmptyNamedLists(): Promise<void>;

  /**
   * Assert a named list is visible on the lists view.
   */
  shouldSeeNamedList(name: string): Promise<void>;

  /**
   * Assert a named list is not visible on the lists view.
   */
  shouldNotSeeNamedList(name: string): Promise<void>;

  /**
   * Open a named list and see its open tasks.
   */
  openNamedList(name: string): Promise<void>;

  /**
   * Assert open tasks on the open list appear in this title order.
   */
  shouldSeeOpenTasksInOrder(titles: string[]): Promise<void>;

  /**
   * Change the open-task order with the kit control (move up or down).
   */
  moveOpenTask(title: string, direction: 'up' | 'down'): Promise<void>;

  /**
   * Reload the open list view.
   */
  refreshOpenList(): Promise<void>;

  /**
   * Open the unlisted open-task pile.
   */
  openUnlistedPile(): Promise<void>;

  /**
   * Open the Tasks All overview (every pile grouped, no reorder).
   */
  openAllOverview(): Promise<void>;

  /**
   * Choose a named list on the All pile dropdown.
   */
  openAllNamedPile(name: string): Promise<void>;

  /**
   * Choose unlisted on the All pile dropdown.
   */
  openAllUnlistedPile(): Promise<void>;

  /**
   * Assert All overview shows these pile group headings, in order.
   */
  shouldSeeAllPileGroups(names: string[]): Promise<void>;

  /**
   * Assert tasks in an All overview group appear in this title order.
   */
  shouldSeeTasksInAllPileGroup(groupName: string, titles: string[]): Promise<void>;

  /**
   * Assert the current Tasks view has no kit up/down reorder controls.
   */
  shouldNotSeeReorderControls(): Promise<void>;

  /**
   * Assert pin still appears on the All view.
   */
  shouldSeePinControls(): Promise<void>;

  /**
   * Open a Tasks filter tab (Today, Upcoming, Mine, Done) and assert the All pile dropdown is not shown.
   */
  shouldSeeTaskFilterWithoutAllPile(filter: 'today' | 'upcoming' | 'mine' | 'completed'): Promise<void>;

  /**
   * Assert the Lists nav still opens the Lists view.
   */
  shouldSeeListsNav(): Promise<void>;

  /**
   * Create a named list from the All pile dropdown (kit dialog).
   * On success, All is on that list’s one-pile view.
   */
  createNamedListFromAll(name: string): Promise<NamedList>;

  /**
   * Assert All is showing this named list’s one-pile view (`pile` = list id).
   */
  shouldBeOnAllNamedPile(listId: string): Promise<void>;

  /**
   * Assert this named list appears in the All pile dropdown.
   */
  shouldSeeNamedPileOnAll(name: string): Promise<void>;

  /**
   * Assert the current All one-pile view has no open tasks.
   */
  shouldSeeEmptyNamedPile(): Promise<void>;

  /**
   * Assert All has no control to delete this named list.
   */
  shouldNotSeeDeleteListOnAll(name: string): Promise<void>;

  /**
   * Delete the named list currently shown as All’s one-pile view (kit dialog).
   * On success, All is back on overview.
   * @throws ConflictError if the list still has open tasks
   */
  deleteNamedListFromAll(name: string): Promise<void>;

  /**
   * Assert All is showing the grouped overview (no `pile` in the URL).
   */
  shouldBeOnAllOverview(): Promise<void>;

  /**
   * Assert this named list does not appear in the All pile dropdown.
   */
  shouldNotSeeNamedPileOnAll(name: string): Promise<void>;

  // ==========================================================================
  // Organization Member Management
  // ==========================================================================

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

  /**
   * Accept an invitation to join an organization.
   * Used by existing authenticated users to join a new organization.
   * Automatically switches to the new organization after accepting.
   * @throws NotFoundError if invitation does not exist
   * @throws AlreadyMemberError if user is already a member of the organization
   * @throws ValidationError if invitation is expired or already used
   */
  acceptInvitation(code: string): Promise<AcceptInvitationResult>;
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
  listNamedLists(): Promise<NamedList[]>;
  createNamedList(name: string): Promise<NamedList>;
  deleteNamedList(id: string): Promise<void>;
  listOpenTasksOnList(listId: string): Promise<Task[]>;
  reorderOpenTasksOnList(listId: string, taskIds: string[]): Promise<Task[]>;
  listUnlistedOpenTasks(): Promise<Task[]>;
  reorderUnlistedOpenTasks(taskIds: string[]): Promise<Task[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput): Promise<Task>;
};
