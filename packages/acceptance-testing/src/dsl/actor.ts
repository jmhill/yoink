import type {
  AppliedImport,
  Capture,
  DiscardedImport,
  NamedList,
  Project,
  HistoryPage,
  FinishedTaskPage,
  ImportProject,
  Note,
  NoteListPage,
  StagedImport,
  Task,
  NowOwner,
  NowQuery,
  NowNextActionsPage,
  ReviewPage,
  ReviewQuery,
  DoneListPage,
  DoneListQuery,
  TaskListPage,
  WorkListsPage,
  NowNextActionRow,
  NowDueRow,
  NowListRow,
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
  ProcessCaptureToProjectInput,
  ProcessCaptureToProjectResult,
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
  processCaptureToProject(
    captureId: string,
    input: ProcessCaptureToProjectInput
  ): Promise<ProcessCaptureToProjectResult>;

  // Named lists. createNamedList is the product write path (any org member).
  listNamedLists(): Promise<NamedList[]>;
  createNamedList(name: string): Promise<NamedList>;
  renameNamedList(id: string, name: string): Promise<NamedList>;
  deleteNamedList(id: string): Promise<void>;

  // Projects. Creating requires a person; agents may list, read, and edit.
  createProject(input: { name: string; objective?: string }): Promise<Project>;
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project>;
  updateProject(
    id: string,
    input: { name?: string; objective?: string | null; notebookPages?: string[] }
  ): Promise<Project>;
  stageProjectImport(projects: ImportProject[]): Promise<StagedImport>;
  listPendingProjectImports(): Promise<StagedImport[]>;
  getProjectImport(id: string): Promise<StagedImport>;
  applyProjectImport(id: string): Promise<AppliedImport>;
  discardProjectImport(id: string): Promise<DiscardedImport>;
  changeProjectStatus(
    id: string,
    input: {
      status: 'active' | 'waiting' | 'someday' | 'done';
      waitingOn?: string | null;
      waitingSince?: string | null;
      openTasks?: 'complete' | 'remove';
    }
  ): Promise<{
    project: Project;
    completedTaskCount: number;
    removedTaskCount: number;
  }>;
  setNextAction(
    projectId: string,
    input:
      | { taskId: string }
      | { taskId: null }
      | { newTask: { title: string; dueDate?: string; assigneeId?: string; listId?: string } }
  ): Promise<{ project: Project; task?: { id: string; title: string } }>;
  listOpenTasksOnProject(projectId: string): Promise<Task[]>;
  listFinishedTasksOnProject(
    projectId: string,
    query?: { limit?: number; cursor?: string }
  ): Promise<FinishedTaskPage>;
  listProjectHistory(
    projectId: string,
    query?: { limit?: number; cursor?: string }
  ): Promise<HistoryPage>;
  listNotes(
    projectId: string,
    query?: { limit?: number; cursor?: string }
  ): Promise<NoteListPage>;
  getNote(projectId: string, noteId: string): Promise<Note>;
  createNote(projectId: string, input: { title: string; body?: string }): Promise<Note>;
  updateNote(
    projectId: string,
    noteId: string,
    input: { title?: string; body?: string; expectedVersion: string }
  ): Promise<Note>;
  deleteNote(projectId: string, noteId: string): Promise<void>;
  listTaskHistory(
    taskId: string,
    query?: { limit?: number; cursor?: string }
  ): Promise<HistoryPage>;
  expectInvalidProjectHistoryCursor(
    projectId: string,
    cursor: string
  ): Promise<{ message: string; code: string }>;
  listOpenTasksOnList(listId: string): Promise<Task[]>;
  reorderOpenTasksOnList(listId: string, taskIds: string[]): Promise<Task[]>;
  listUnlistedOpenTasks(): Promise<Task[]>;
  reorderUnlistedOpenTasks(taskIds: string[]): Promise<Task[]>;

  // Task operations
  createTask(input: CreateTaskInput): Promise<Task>;
  listTasks(
    filter?: TaskFilter,
    viewer?: { timeZone?: string }
  ): Promise<Task[]>;
  listNowNextActions(query?: NowQuery): Promise<NowNextActionsPage>;
  listNowDue(query?: NowQuery): Promise<TaskListPage>;
  listWorkLists(): Promise<WorkListsPage>;
  listReview(query?: ReviewQuery): Promise<ReviewPage>;
  listDone(query?: DoneListQuery): Promise<DoneListPage>;
  backdateReviewProject(projectId: string, occurredAt: string): Promise<void>;
  finishTaskAt(taskId: string, completedAt: string): Promise<void>;
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
   * Human-session only. Bot tokens receive 403.
   * @throws TokenLimitReachedError if user has reached the max tokens (2 per org)
   * @throws ForbiddenError if a bot token tries to create
   */
  createToken(name: string): Promise<CreateTokenResult>;

  /**
   * Issue a new token for an existing agent member. Owner only.
   */
  reissueAgentToken(memberUserId: string): Promise<{ token: Token; rawToken: string }>;

  /**
   * Revoke (delete) an API token by ID.
   * Only the token owner can revoke their own tokens.
   * @throws NotFoundError if token does not exist
   * @throws ForbiddenError if user does not own the token, or a bot token tries
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

export type MobileTabKey = 'capture' | 'process' | 'work' | 'review';

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
   * Open the Organization tab on Settings.
   */
  openOrganizationSettings(): Promise<void>;

  /**
   * Issue a new token for an agent member through the Members list.
   * Returns the raw token shown once in the dialog.
   */
  issueNewTokenForAgentFromMembers(memberName: string): Promise<string>;

  /**
   * Switch to a different organization.
   * Only works with session auth (not token auth).
   * Reloads the page after switching.
   */
  switchOrganization(organizationId: string): Promise<void>;

  /**
   * Assert the header org switcher shows this organization as current.
   * Multi-org sessions show a chevron; the name is still in the control.
   */
  shouldSeeCurrentOrganizationInHeader(orgName: string): Promise<void>;

  /**
   * Open the header org switcher and assert the picker lists these orgs
   * and is the topmost hit — not clipped or buried by header / rail /
   * Vaul chrome. Closes the picker afterwards.
   */
  shouldOpenOrgSwitcherPicker(orgNames: string[]): Promise<void>;

  /**
   * Pick an organization from the header org switcher. Reloads so the
   * session and header show the new org.
   */
  pickOrganizationFromHeader(orgName: string): Promise<void>;

  /**
   * Intercept POST /api/organizations/switch as a failure, pick this org
   * from the header, and assert an error toast is shown (not silent).
   * Session stays on the previous org.
   */
  shouldSeeOrgSwitchFailureToast(orgName: string): Promise<void>;

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
   * Open a Lists bookmark (`/lists`). Lands on Tasks All overview.
   */
  goToLists(): Promise<void>;

  /**
   * Open `/lists`. Lands on Tasks All overview.
   */
  openListsUrl(): Promise<void>;

  /**
   * Open `/lists/:listId`. Lands on All’s named-list one-pile.
   */
  openNamedListUrl(listId: string): Promise<void>;

  /**
   * Open `/lists/unlisted`. Lands on All Unlisted.
   */
  openUnlistedListUrl(): Promise<void>;

  /**
   * Assert All’s pile dropdown has no named lists (empty lists still appear
   * there when they exist — this is how you find an empty list).
   */
  shouldSeeEmptyNamedLists(): Promise<void>;

  /**
   * Assert a named list is visible in All’s pile dropdown.
   */
  shouldSeeNamedList(name: string): Promise<void>;

  /**
   * Assert a named list is not visible in All’s pile dropdown.
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
   * Open Done (completed history).
   */
  openDone(): Promise<void>;

  /**
   * Click the history Load more control.
   */
  clickLoadMore(): Promise<void>;

  /**
   * Assert Load more is on screen.
   */
  shouldSeeLoadMore(): Promise<void>;

  /**
   * Assert Load more is gone — the history page is complete.
   */
  shouldNotSeeLoadMore(): Promise<void>;

  /**
   * Assert each task title is on the current screen (Done included).
   */
  shouldSeeEveryTaskTitle(titles: string[]): Promise<void>;

  /**
   * Assert each capture's content is on the current pane (Trash included).
   */
  shouldSeeEveryCaptureContent(contents: string[]): Promise<void>;

  /**
   * Change the open-task order by dragging one step up or down.
   */
  moveOpenTask(title: string, direction: 'up' | 'down'): Promise<void>;

  /**
   * Drag an open task onto another open task on a one-pile screen.
   * One continuous pointer gesture — can cross any number of open slots.
   * Persists the new open order (pointer / mouse).
   */
  dragOpenTaskOnto(sourceTitle: string, targetTitle: string): Promise<void>;

  /**
   * Drag an open task onto another via touch on a one-pile screen.
   * One continuous gesture — can cross any number of open slots.
   */
  dragOpenTaskOntoByTouch(sourceTitle: string, targetTitle: string): Promise<void>;

  /**
   * Reload the open list view.
   */
  refreshOpenList(): Promise<void>;

  /**
   * Open the unlisted open-task pile.
   */
  openUnlistedPile(): Promise<void>;

  /**
   * Assert All is not a destination: no All filter tab, no All rail row,
   * no `#all-pile` dropdown.
   */
  shouldNotSeeAllDestination(): Promise<void>;

  /**
   * Open an old All URL (`/tasks`, `/tasks?filter=all`,
   * `/tasks?filter=all&pile=…`). Lands on Today.
   */
  openOldAllUrl(path: string): Promise<void>;

  /**
   * Assert the current screen is Today (`filter=today`), not All.
   */
  shouldBeOnToday(): Promise<void>;

  /**
   * Open the Tasks All overview (every pile grouped, no reorder).
   * @deprecated All is gone; leftover All URLs land on Today.
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
   * Assert the current Tasks view has no Reorder button, Done button,
   * drag grip, or leftover kit up/down.
   */
  shouldNotSeeReorderControls(): Promise<void>;

  /**
   * Assert pin/unpin chrome is gone from task rows. Backend pin stays.
   */
  shouldNotSeePinControls(): Promise<void>;

  /**
   * Open a Tasks filter tab (Today, Upcoming, Mine, Done) and assert the All pile dropdown is not shown.
   */
  shouldSeeTaskFilterWithoutAllPile(filter: 'today' | 'upcoming' | 'mine' | 'completed'): Promise<void>;

  /**
   * Open the Work / Now screen. Mine is off unless `mine` is true.
   */
  openWork(options?: { mine?: boolean }): Promise<void>;

  /**
   * Open Work from the desktop section row, or Now from the phone drawer.
   * Waits for `[data-now-ready][data-now-owner]`.
   */
  openRailWork(): Promise<void>;

  /**
   * Flip the Now Mine toggle and wait until the matching owner is ready.
   */
  toggleNowMine(): Promise<void>;

  /**
   * Assert Now has settled for this owner (`data-now-ready` + `data-now-owner`).
   */
  shouldSeeNowReady(owner: NowOwner): Promise<void>;

  /**
   * Assert the Work heading subcopy string exactly.
   */
  shouldSeeNowSubcopy(text: string): Promise<void>;

  /**
   * Assert the Mine toggle pressed state and `?mine=true` when on.
   */
  shouldSeeNowMinePressed(pressed: boolean): Promise<void>;

  /**
   * Assert Next action rows in order: title, project, owner (empty string if none).
   */
  shouldSeeNowNextActionRows(rows: NowNextActionRow[]): Promise<void>;

  /**
   * Assert Due rows in order: title and owner (empty string if none).
   */
  shouldSeeNowDueRows(rows: NowDueRow[]): Promise<void>;

  /**
   * Assert the single empty-Now card is showing.
   */
  shouldSeeNowEmpty(): Promise<void>;

  /**
   * Open the phone Lists sheet from the Now lists row.
   */
  openNowListsSheet(): Promise<void>;

  /**
   * Assert Lists-sheet rows in order, including Unlisted last before New list.
   */
  shouldSeeNowListRows(rows: NowListRow[]): Promise<void>;

  /**
   * Pick a named list or Unlisted from the Now lists sheet and land on that pile.
   */
  pickNowList(listId: string): Promise<void>;

  /**
   * Assert a rail list open-count (`data-rail-list-count`).
   */
  shouldSeeRailListCount(listId: string, count: number): Promise<void>;

  /**
   * Assert a one-word rail label stays on a single line (no Weeke/nd wrap).
   */
  shouldSeeRailLabelOnOneLine(label: string): Promise<void>;

  /**
   * Scroll the Due section so it clears the phone tab bar.
   */
  scrollNowDueClearOfTabBar(): Promise<void>;

  /**
   * Open the Tasks Today view (overdue vs due today outer, list groups inside).
   */
  openToday(): Promise<void>;

  /**
   * Open the Tasks Upcoming view (grouped by list, no overdue split).
   */
  openUpcoming(): Promise<void>;

  /**
   * Assert the current Tasks view shows these pile group headings, in order.
   */
  shouldSeePileGroups(names: string[]): Promise<void>;

  /**
   * Assert tasks in a pile group appear in this title order.
   */
  shouldSeeTasksInPileGroup(groupName: string, titles: string[]): Promise<void>;

  /**
   * Assert Today’s outer headings are overdue then due today, in this order.
   */
  shouldSeeTodayOuterSections(sections: Array<'overdue' | 'due-today'>): Promise<void>;

  /**
   * Assert a Today deadline section shows these pile groups, in order.
   */
  shouldSeePileGroupsInTodaySection(
    section: 'overdue' | 'due-today',
    names: string[]
  ): Promise<void>;

  /**
   * Assert tasks in a pile group inside a Today deadline section appear in this title order.
   */
  shouldSeeTasksInTodaySectionPileGroup(
    section: 'overdue' | 'due-today',
    groupName: string,
    titles: string[]
  ): Promise<void>;

  /**
   * Assert the current view has no overdue / due-today split (Upcoming).
   */
  shouldNotSeeTodayDueSplit(): Promise<void>;

  /**
   * Assert All still has its two-mode pile dropdown.
   * @deprecated All is gone — use shouldNotSeeAllDestination.
   */
  shouldSeeAllPileDropdown(): Promise<void>;

  /**
   * Open the Tasks Mine overview (my tasks grouped by list, no reorder).
   */
  openMineOverview(): Promise<void>;

  /**
   * Open an old Mine one-pile URL (`?filter=mine&pile=…`).
   * Lands on the plain Mine overview.
   */
  openOldMinePileUrl(pile: string): Promise<void>;

  /**
   * Assert the current screen is the Mine overview: `filter=mine`,
   * no pile in the URL, no Mine pile dropdown.
   */
  shouldBeOnMineOverview(): Promise<void>;

  /**
   * Assert Mine has no pile dropdown (All still may).
   */
  shouldNotSeeMinePileDropdown(): Promise<void>;

  /**
   * Assert the rail My tasks row is highlighted (not a named list).
   */
  shouldSeeRailMineHighlighted(): Promise<void>;

  /**
   * Assert the current named-list / Unlisted view can enter reorder
   * (Reorder or Done is visible).
   */
  shouldSeeReorderControls(): Promise<void>;

  /**
   * Enter reorder mode from the list header Reorder button.
   */
  enterReorderMode(): Promise<void>;

  /**
   * Leave reorder mode with Done.
   */
  exitReorderMode(): Promise<void>;

  /**
   * Assert the header reads Reorder, Done is visible, and grips show.
   */
  shouldSeeReorderMode(): Promise<void>;

  /**
   * Hold a drag mid-gesture and assert the lifted card, neighbor gap,
   * and accent insertion line. Avoids animation-timing assertions.
   */
  shouldSeeDropSlotWhileDragging(sourceTitle: string, targetTitle: string): Promise<void>;

  /**
   * Assert board task titles appear in this order (current Tasks view).
   */
  shouldSeeTaskTitles(titles: string[]): Promise<void>;

  /**
   * Assert this task is not shown on the current Tasks view.
   */
  shouldNotSeeTask(taskId: string): Promise<void>;

  /**
   * Assert Mine has no control to create a named list.
   */
  shouldNotSeeCreateListOnMine(): Promise<void>;

  /**
   * Assert Mine has no control to delete this named list.
   */
  shouldNotSeeDeleteListOnMine(name: string): Promise<void>;

  /**
   * Assert there is no Lists item in the nav.
   */
  shouldNotSeeListsNav(): Promise<void>;

  /**
   * Create a named list from the All pile dropdown (kit dialog).
   * @deprecated All is gone — use createNamedListFromRail.
   */
  createNamedListFromAll(name: string): Promise<NamedList>;

  /**
   * Assert the named-list pile screen (`?pile=` = list id, not filter=all).
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
   * @deprecated All is gone — use deleteNamedListFromRail. Lands on Today.
   * @throws ConflictError if the list still has open tasks
   */
  deleteNamedListFromAll(name: string): Promise<void>;

  /**
   * Assert All is showing the grouped overview (no `pile` in the URL).
   * @deprecated All overview is gone — leftover All URLs land on Today.
   */
  shouldBeOnAllOverview(): Promise<void>;

  /**
   * Assert the Unlisted pile screen (`?pile=unlisted`, not filter=all).
   */
  shouldBeOnAllUnlistedPile(): Promise<void>;

  /**
   * Assert this named list does not appear in the All pile dropdown.
   */
  shouldNotSeeNamedPileOnAll(name: string): Promise<void>;

  /**
   * Assert the visible app rail shows these labels in order.
   * Desktop: Capture, Process, Work, smart views, lists, Review, projects.
   * Phone drawer: Inbox, Now, smart views, lists, projects.
   */
  shouldSeeRailItems(labels: string[]): Promise<void>;

  /**
   * Assert the Process (desktop) or Inbox-mode (phone drawer) badge
   * shows this capture count. Count must be positive — a zero badge is hidden.
   */
  shouldSeeProcessCountOnRail(count: number): Promise<void>;

  /**
   * Assert the Process / Inbox-mode rail badge is hidden (empty inbox).
   */
  shouldNotSeeProcessCountOnRail(): Promise<void>;

  /**
   * Assert the desktop sidebar has Capture, Process, Work, and Review
   * section rows in that order, with separators between them, Lists
   * under Work, and projects under Review.
   */
  shouldSeeDesktopRailSections(): Promise<void>;

  /**
   * Assert this desktop section row is the only lit rail row.
   */
  shouldSeeRailSectionHighlighted(key: 'capture' | 'process' | 'work' | 'review'): Promise<void>;

  /**
   * Scroll the desktop sidebar until this rail label is in view.
   */
  scrollDesktopRailSoLabelIsVisible(label: string): Promise<void>;

  /**
   * Open Process from the desktop section row. Waits on `data-process-ready`.
   */
  openRailProcess(): Promise<void>;

  /**
   * Open Review from the desktop section row. Waits on `/projects` and `data-review-ready`.
   */
  openRailReview(): Promise<void>;

  /**
   * Assert this rail label is the only lit row.
   */
  shouldSeeRailRowHighlighted(label: string): Promise<void>;

  /**
   * Assert the Capture section row has no inbox-count badge.
   */
  shouldSeeNoCountOnCaptureSection(): Promise<void>;

  /**
   * Assert the phone “‹ Work” back row sits above the list title.
   */
  shouldSeeBackToWorkAbovePlaceHeading(): Promise<void>;

  /**
   * Assert the rail has a Lists heading above this named list
   * (and after the last smart view).
   */
  shouldSeeListsHeadingAboveNamedList(name: string): Promise<void>;

  /**
   * Assert Inbox reads as a capture/triage mode, loud-separated from
   * the task family (Today → Done), with Lists still after Done.
   * Destinations stay the same — no new rail rows.
   */
  shouldSeeInboxModeSeparatedFromTaskFamily(): Promise<void>;

  /**
   * Open a named list from the rail. Lands on that pile screen.
   */
  openRailNamedList(name: string): Promise<void>;

  /**
   * Open Unlisted from the rail. Lands on the Unlisted pile screen.
   */
  openRailUnlisted(): Promise<void>;

  /**
   * Open a smart view from the rail (Today, Upcoming, My tasks, Done).
   */
  openRailSmartView(view: 'today' | 'upcoming' | 'mine' | 'done'): Promise<void>;

  /**
   * Assert the current Tasks view has the add-task field.
   */
  shouldSeeAddTaskField(): Promise<void>;

  /**
   * Assert the current Tasks view has no add-task field (Done).
   */
  shouldNotSeeAddTaskField(): Promise<void>;

  /**
   * Create a named list from the rail New list control (kit dialog).
   * On success, lands on that list’s pile screen.
   */
  createNamedListFromRail(name: string): Promise<NamedList>;

  /**
   * Create a project from the rail New project control (kit dialog).
   * On success, lands on that project's page.
   */
  createProjectFromRail(input: { name: string; objective?: string }): Promise<Project>;

  /**
   * Assert the open project page shows this name, optional objective, and status.
   */
  shouldSeeProjectPage(input: {
    name: string;
    objective?: string;
    status: string;
  }): Promise<void>;

  /**
   * Edit the open project page's name and save.
   */
  editProjectName(name: string): Promise<void>;

  /**
   * Edit the open project page's objective and save.
   */
  editProjectObjective(objective: string): Promise<void>;

  /**
   * Open the project page for this id.
   */
  goToProject(projectId: string): Promise<void>;
  goToImportPreview(importId: string): Promise<void>;
  reviewPendingImport(): Promise<void>;
  shouldSeePendingImportBanner(text: string): Promise<void>;
  shouldNotSeePendingImportBanner(): Promise<void>;
  shouldSeeImportPreviewProject(name: string): Promise<void>;
  shouldSeeImportPreviewSummary(text: string): Promise<void>;
  shouldSeeImportPreviewCollapsed(name: string): Promise<void>;
  shouldSeeImportPreviewExpanded(name: string): Promise<void>;
  expandImportPreviewProject(name: string): Promise<void>;
  shouldSeeImportFooter(): Promise<void>;
  shouldSeeImportFooterWhilePreviewScrolledTo(name: string): Promise<void>;
  shouldSeeImportWarning(text: string): Promise<void>;
  shouldSeeImportError(text: string): Promise<void>;
  applyImportOnPreview(): Promise<void>;
  discardImportOnPreview(): Promise<void>;
  scrollImportPreviewProject(name: string): Promise<void>;
  scrollImportActionsIntoView(): Promise<void>;
  highlightImportDiscard(): Promise<void>;
  pressImportDiscardAndHold(): Promise<void>;
  releaseHeldImportDiscard(): Promise<void>;
  shouldSeeNotebookPage(path: string): Promise<void>;
  shouldSeeNotebookHref(path: string, href: string): Promise<void>;
  shouldSeeNotebookPageInputs(paths: string[]): Promise<void>;
  typeNotebookPageAndKeepFocus(index: number, extra: string): Promise<void>;
  addNotebookPageWithEnter(path: string): Promise<void>;
  scrollProjectHeadingIntoView(): Promise<void>;
  scrollProjectHistoryIntoView(): Promise<void>;

  /**
   * Open the status select on the project page and wait for it to settle.
   */
  openProjectStatusSelect(visibleOptionName?: string): Promise<void>;

  /**
   * Click Waiting in the open project-status select (leaves waiting fields visible).
   */
  pageClickWaitingOption(): Promise<void>;

  /**
   * Click Done in the open project-status select and wait for the
   * open-tasks confirm dialog (used when the project still has open tasks).
   */
  pageClickDoneOption(): Promise<void>;

  /**
   * Change status from the project-page control (not waiting / not done-with-tasks).
   */
  setProjectStatusFromPage(status: 'active' | 'someday' | 'done'): Promise<void>;

  /**
   * Set waiting from the project-page fields. Since defaults to today when omitted.
   */
  setProjectWaitingFromPage(input: {
    waitingOn: string;
    waitingSince?: string;
    unknownSince?: boolean;
  }): Promise<void>;

  /**
   * Confirm completing open tasks when marking the project done.
   * Leaves the confirm dialog closed and the status chip on done.
   */
  confirmDoneComplete(): Promise<void>;

  /**
   * Confirm taking open tasks out of the project when marking it done.
   * Leaves the confirm dialog closed and the status chip on done.
   */
  confirmDoneRemove(): Promise<void>;

  /**
   * Assert the waiting summary line on the project page.
   */
  shouldSeeWaitingSummary(text: string): Promise<void>;

  /**
   * Open the next-action picker from Set / Change.
   */
  openNextActionPicker(): Promise<void>;

  /**
   * Pick an existing open task in the next-action picker.
   */
  pickNextActionFromPicker(title: string): Promise<void>;

  /**
   * Create a new task from the next-action picker and set it.
   */
  createNextActionFromPicker(title: string): Promise<void>;

  /**
   * Complete the next-action card from the project page (shows What’s next).
   */
  completeNextActionFromPage(title: string): Promise<void>;

  /**
   * Skip the What’s next prompt.
   */
  skipWhatsNext(): Promise<void>;

  /**
   * Pick an open task from the What’s next prompt.
   */
  pickWhatsNextTask(title: string): Promise<void>;

  /**
   * Assert the next-action card shows this title.
   */
  shouldSeeNextAction(title: string): Promise<void>;

  /**
   * Assert the dashed no-next-action card is showing.
   */
  shouldSeeNoNextActionCard(): Promise<void>;

  /**
   * Assert the What’s next prompt is visible.
   */
  shouldSeeWhatsNext(): Promise<void>;

  /**
   * Assert the dashed no-next-action warning is not showing and a plain
   * Set next action link is (someday, no warning).
   */
  shouldSeeSomedaySetNextActionLink(): Promise<void>;

  /**
   * Close the next-action picker / What’s next drawer without choosing.
   */
  dismissNextActionPicker(): Promise<void>;

  /**
   * Assert the Change next-action drawer body overflows and Create and set
   * is in the viewport and enabled after a title is typed.
   */
  shouldSeePickerCreateInViewport(): Promise<void>;

  /**
   * Assert the What’s next drawer body overflows and Skip plus Create and set
   * are in the viewport and clickable.
   */
  shouldSeeWhatsNextFooterInViewport(): Promise<void>;

  /**
   * Assert All projects shows the amber no-next-action label for this name.
   */
  shouldSeeNoNextActionOnAllProjects(name: string): Promise<void>;

  /**
   * Assert the rail shows the amber missing-next-action dot for this name.
   */
  shouldSeeNoNextActionDotOnRail(name: string): Promise<void>;

  /**
   * Submit a blank name in the Edit dialog and assert the error.
   */
  shouldSeeBlankProjectNameError(): Promise<void>;

  /**
   * Open the project Edit dialog for a screenshot, then leave it open.
   */
  openProjectEditDialog(): Promise<void>;

  /**
   * Close the project Edit dialog without saving.
   */
  dismissProjectEditDialog(): Promise<void>;

  /**
   * Delete the open task from the Edit dialog confirm.
   */
  deleteTaskFromEdit(): Promise<void>;

  /**
   * Clear the project on the open task Edit dialog and save.
   */
  clearTaskProjectFromEdit(): Promise<void>;

  /**
   * Assert only one status control and waiting fields hidden until Waiting.
   */
  shouldSeeSingleStatusControl(): Promise<void>;

  /**
   * Scroll the History row into view on the project page.
   */
  shouldSeeHistorySection(): Promise<void>;
  expandProjectHistory(): Promise<void>;
  expandProjectFinished(): Promise<void>;
  clickProjectHistoryMore(): Promise<void>;
  loadAllProjectHistory(): Promise<void>;
  shouldSeeHistoryEntry(input: {
    kind: string;
    actor: string;
    text: string;
    deleted?: boolean;
    highlight?: boolean;
  }): Promise<void>;
  shouldSeeHistoryEntryCount(count: number): Promise<void>;
  shouldSeeHistoryMore(): Promise<void>;
  shouldSeeHistoryStart(): Promise<void>;
  shouldNotSeeHistoryStart(): Promise<void>;
  shouldSeeHistoryLinesInOrder(texts: string[]): Promise<void>;
  shouldSeeNotesReady(): Promise<void>;
  shouldSeeNotesEmpty(): Promise<void>;
  shouldSeeNoteOnProject(input: { title: string; excerpt?: string; stamp?: string }): Promise<void>;
  shouldNotSeeNoteOnProject(title: string): Promise<void>;
  shouldSeeNotesBetweenNextActionAndNotebook(): Promise<void>;
  addNoteOnProject(input: { title: string; body?: string }): Promise<Note>;
  openNoteOnProject(title: string): Promise<void>;
  shouldSeeOpenNote(input: { title: string; bodyText?: string }): Promise<void>;
  shouldNotSeeRawHtmlInNote(text: string): Promise<void>;
  startEditingOpenNote(): Promise<void>;
  editOpenNote(input: { title?: string; body?: string }): Promise<void>;
  saveOpenNote(): Promise<void>;
  cancelOpenNote(): Promise<void>;
  shouldSeeNoteEditor(): Promise<void>;
  shouldSeeNoteStale(): Promise<void>;
  seeNewerNoteVersion(): Promise<void>;
  saveOpenNoteAsCopy(): Promise<void>;
  deleteOpenNote(): Promise<void>;
  toggleNotePreview(): Promise<void>;
  shouldSeeNotePreview(): Promise<void>;
  shouldSeeDiscardChangesPrompt(): Promise<void>;
  keepEditingNote(): Promise<void>;
  discardNoteChanges(): Promise<void>;
  shouldSeeFinishedTask(title: string): Promise<void>;
  shouldSeeFinishedBy(title: string, text: string): Promise<void>;
  shouldNotSeeFinishedTask(title: string): Promise<void>;
  reopenFinishedTask(title: string): Promise<void>;

  /**
   * Assert a project is in the rail's open (active/waiting) section.
   */
  shouldSeeProjectOnRail(name: string): Promise<void>;

  /**
   * Assert a project is listed under the rail's collapsed Someday group.
   */
  shouldSeeProjectInSomedayGroup(name: string): Promise<void>;

  /**
   * Assert a project is not on the rail (done leaves the rail).
   */
  shouldNotSeeProjectOnRail(name: string): Promise<void>;

  /**
   * Open the rail Someday group.
   */
  openSomedayGroup(): Promise<void>;

  /**
   * Open Review and expand All projects.
   */
  goToAllProjects(): Promise<void>;

  /**
   * Assert the All projects list lists this project and status.
   */
  shouldSeeProjectOnAllProjects(input: { name: string; status: string }): Promise<void>;

  /**
   * Open Review and wait until `[data-review-ready]` is set.
   */
  openReview(): Promise<void>;

  /**
   * Assert Review has settled (`data-review-ready`).
   */
  shouldSeeReviewReady(): Promise<void>;

  /**
   * Assert Review's empty copy.
   */
  shouldSeeReviewEmpty(): Promise<void>;

  /**
   * Assert the Review heading subcopy string exactly.
   */
  shouldSeeReviewSubcopy(text: string): Promise<void>;

  /**
   * Assert a Review section is visible.
   */
  shouldSeeReviewSection(section: 'noNextAction' | 'quiet' | 'waiting'): Promise<void>;

  /**
   * Assert a Review row is in this section with these reasons.
   */
  shouldSeeReviewItem(input: {
    name: string;
    section: 'noNextAction' | 'quiet' | 'waiting';
    reasons: string;
  }): Promise<void>;

  /**
   * Assert a project is not on the Review attention list.
   */
  shouldNotSeeReviewItem(name: string): Promise<void>;

  /**
   * Assert a waiting group label and the project names under it.
   */
  shouldSeeReviewWaitingGroup(input: { label: string; names: string[] }): Promise<void>;

  /**
   * Assert a Review row's last-change or waiting copy.
   */
  shouldSeeReviewRowCopy(name: string, copy: string): Promise<void>;

  /**
   * Set a next action from Review by creating a new task.
   */
  setReviewNextAction(input: { projectName: string; title: string }): Promise<void>;

  /**
   * Change a Review project's status to waiting (who + since).
   */
  changeReviewStatusToWaiting(input: {
    projectName: string;
    waitingOn: string;
    waitingSince: string;
  }): Promise<void>;

  /**
   * Expand the collapsed All projects list on Review.
   */
  expandAllProjects(): Promise<void>;

  /**
   * Assert the Review tab/section badge.
   */
  shouldSeeReviewBadge(count: number): Promise<void>;

  /**
   * Assert the Review badge is hidden.
   */
  shouldNotSeeReviewBadge(): Promise<void>;

  /**
   * Open Set next action on this Review row without submitting.
   */
  openReviewSetNextAction(projectName: string): Promise<void>;

  /**
   * Open Change status on this Review row without submitting.
   */
  openReviewChangeStatus(projectName: string): Promise<void>;

  /**
   * Assert the Done this week section has settled on this Monday.
   */
  shouldSeeDoneWeek(monday: string): Promise<void>;

  /**
   * Assert a Done this week project group and its task titles, newest first.
   */
  shouldSeeDoneGroup(input: { name: string; titles: string[] }): Promise<void>;

  /**
   * Assert a finished-task when line inside a Done group.
   */
  shouldSeeDoneTaskWhen(input: { projectName: string; title: string; copy: string }): Promise<void>;

  /**
   * Assert the "Plus N tasks not in a project" line.
   */
  shouldSeeDoneOther(copy: string): Promise<void>;

  /**
   * Assert the Done this week empty copy.
   */
  shouldSeeDoneEmpty(): Promise<void>;

  /**
   * Assert a project group shows Next: title.
   */
  shouldSeeDoneNext(input: { projectName: string; title: string }): Promise<void>;

  /**
   * Assert a project group shows Set next action.
   */
  shouldSeeDoneSetNext(projectName: string): Promise<void>;

  /**
   * Open Set next action from a Done this week group.
   */
  openDoneSetNextAction(projectName: string): Promise<void>;

  /**
   * Set a next action from Done this week by creating a new task.
   */
  setDoneNextAction(input: { projectName: string; title: string }): Promise<void>;

  /**
   * Go to the previous Done this week.
   */
  goToPreviousDoneWeek(): Promise<void>;

  /**
   * Go to the next Done this week.
   */
  goToNextDoneWeek(): Promise<void>;

  /**
   * Scroll Done this week into view above the phone tab bar.
   */
  scrollDoneIntoView(): Promise<void>;

  /**
   * Scroll the Waiting section and its groups into view for a screenshot.
   */
  scrollReviewWaitingIntoView(): Promise<void>;

  /**
   * Assert the edit-task dialog subtitle.
   */
  shouldSeeEditTaskDialogSubtitle(text: string): Promise<void>;

  /**
   * Assert the open project page lists this open task title.
   */
  shouldSeeOpenTaskOnProject(title: string): Promise<void>;

  /**
   * Assert the open project page does not list this open task title.
   */
  shouldNotSeeOpenTaskOnProject(title: string): Promise<void>;

  /**
   * Assert the open project page lists these open task titles newest first.
   */
  shouldSeeOpenTasksOnProjectInOrder(titles: string[]): Promise<void>;

  /**
   * Promote the open capture onto this project (sheet project picker).
   */
  confirmPromoteOnProject(projectName: string): Promise<Task>;

  /**
   * Assert this named-list rail row has a kit overflow whose menu includes
   * Rename next to Delete. Unlisted and smart views do not have this overflow.
   */
  shouldSeeNamedListOverflowOnRail(name: string): Promise<void>;

  /**
   * Assert the named-list overflow Delete menu is stacked above the open
   * mobile Tasks drawer (not under the sheet). Delete is reachable.
   */
  shouldSeeNamedListOverflowAboveMobileDrawer(name: string): Promise<void>;

  /**
   * Assert the named-list overflow Delete menu is stacked above other
   * chrome on the always-visible desktop sidebar. Delete is reachable
   * with a real pointer click.
   */
  shouldSeeNamedListOverflowOnDesktopSidebar(name: string): Promise<void>;

  /**
   * Assert opening this named-list overflow does not navigate. The current
   * view (URL) stays put; the menu opens.
   */
  shouldNotNavigateWhenOpeningNamedListOverflow(name: string): Promise<void>;

  /**
   * Assert this named-list rail label wraps onto two or more lines and is
   * fully readable — not one truncated ellipsis line that needs hover.
   */
  shouldSeeWrappedRailNamedList(name: string): Promise<void>;

  /**
   * Assert this named-list rail row is the active (highlighted) destination.
   */
  shouldSeeRailNamedListHighlighted(name: string): Promise<void>;

  /**
   * Assert the page (and the rail) does not scroll horizontally because of
   * a long list name.
   */
  shouldSeeNoHorizontalPageScrollFromRail(): Promise<void>;

  /**
   * Assert every named-list rail label’s painted text stays clear of that
   * row’s `[data-rail-list-count]` and overflow button.
   */
  shouldSeeNamedListLabelsClearOfCountAndOverflow(): Promise<void>;

  /**
   * Assert this rail row (Unlisted, Inbox, a smart view, New list) has no overflow.
   */
  shouldNotSeeNamedListOverflowOnRail(label: string): Promise<void>;

  /**
   * Delete a named list from its rail-row overflow.
   * On success the name leaves the rail. If the member was viewing that pile,
   * they land on Today. Other views stay put.
   * @throws ConflictError if the list still has open tasks
   */
  deleteNamedListFromRail(name: string): Promise<void>;

  /**
   * Rename a named list from its rail-row overflow: Rename next to Delete,
   * then in-place edit. Saves on Enter or Done.
   * @throws ValidationError if the name is blank or over 200 characters
   * @throws ConflictError if another list already has the name
   */
  renameNamedListFromRail(
    currentName: string,
    newName: string,
    options?: { submit?: 'enter' | 'done' }
  ): Promise<NamedList>;

  /**
   * Start a rail rename, type a draft, then cancel via Escape or clicking away.
   * The old name stays.
   */
  cancelNamedListRenameFromRail(
    currentName: string,
    draftName: string,
    via: 'escape' | 'click-away'
  ): Promise<void>;

  /**
   * Open the rail rename field for this list and leave it focused.
   */
  beginNamedListRenameFromRail(currentName: string): Promise<void>;

  /**
   * Assert the open rail rename field still has this draft text.
   */
  shouldSeeNamedListRenameDraft(value: string): Promise<void>;

  /**
   * Assert the current Tasks filter (does not navigate).
   */
  shouldBeOnTaskFilter(filter: 'today' | 'upcoming' | 'mine' | 'completed'): Promise<void>;

  /**
   * Assert the visible task card has no list label (current view, no navigation).
   */
  shouldNotSeeListOnVisibleTask(taskId: string): Promise<void>;

  /**
   * Assert the current add-task form has the list picker (`#create-task-list`).
   */
  shouldSeeCreateTaskListPicker(): Promise<void>;

  /**
   * Assert the current add-task form has no list picker
   * (named-list and Unlisted screens).
   */
  shouldNotSeeCreateTaskListPicker(): Promise<void>;

  /**
   * Submit add-task on the current Tasks view without touching the list picker.
   * Named-list / Unlisted screens create onto that pile; other views stay unlisted
   * unless the picker was already set.
   */
  addTaskOnCurrentView(title: string): Promise<Task>;

  /**
   * Open Capture from the desktop section row, or Inbox from the phone
   * drawer. Lands on the capture pane (`/`), not Tasks.
   */
  openRailCapture(): Promise<void>;

  /**
   * Assert the current screen is the Inbox pane of captures: `/`, Inbox tab
   * selected, quick-add present, not a task board.
   */
  shouldBeOnInboxPane(): Promise<void>;

  /**
   * Assert the capture-pane tab strip shows these labels in order
   * (Inbox, Snoozed, Trash).
   */
  shouldSeeInboxPaneTabs(labels: string[]): Promise<void>;

  /**
   * Assert Snoozed and Trash are not rail items.
   */
  shouldNotSeeSnoozedOrTrashOnRail(): Promise<void>;

  /**
   * Open a tab on the capture pane (not a rail item).
   */
  openInboxPaneTab(tab: 'inbox' | 'snoozed' | 'trash'): Promise<void>;

  /**
   * Assert the capture-pane tab is selected and the matching route is showing.
   */
  shouldBeOnInboxPaneTab(tab: 'inbox' | 'snoozed' | 'trash'): Promise<void>;

  /**
   * Assert the Capture section (desktop) or Inbox mode row (phone drawer)
   * is highlighted, including on Snoozed / Trash.
   */
  shouldSeeRailCaptureHighlighted(): Promise<void>;

  /**
   * Assert this capture is visible on the current pane (no navigation).
   */
  shouldSeeCaptureOnCurrentPane(content: string): Promise<void>;

  /**
   * Assert an inbox capture row has Promote / Snooze / Trash, and has no
   * checkbox, drag handle, or due date.
   */
  shouldSeeInboxCaptureActions(content: string): Promise<void>;

  /**
   * Assert this capture reads as a dense snippet: full content (including
   * wrapped lines), prominent source + time, no task complete/grip/pin.
   */
  shouldSeeDenseCaptureSnippet(content: string, sourceLine: string | RegExp): Promise<void>;

  /**
   * Assert Promote / Snooze / Trash hit targets are usable (~44px).
   * Call after useMobileViewport — desktop is allowed to be denser.
   */
  shouldSeeUsableCaptureActionTargets(content: string): Promise<void>;

  /**
   * Assert snippet content and source line stay distinct from the card
   * background in the current appearance (theme tokens, not light-only).
   */
  shouldSeeCaptureSnippetReadable(content: string): Promise<void>;

  /**
   * Swipe the capture right to Trash. Capture leaves the current pane.
   */
  trashCaptureBySwipe(content: string): Promise<void>;

  /**
   * Assert the current screen is the Capture pane (not the task
   * checklist surface): heading Capture, no to-process subtitle.
   */
  shouldSeeInboxTriageSurface(): Promise<void>;

  /**
   * Assert the current screen is a task pile/smart view on the existing
   * task surface — not the Inbox triage surface.
   */
  shouldSeeTaskSurface(): Promise<void>;

  /**
   * Assert Inbox-grade you-are-here chrome on the current task view:
   * the place name as the primary heading, plus this short count cue.
   * Visible without opening the rail.
   */
  shouldSeeTaskPlace(heading: string, subcopy: string): Promise<void>;

  /**
   * Assert the task place heading and cue stay distinct from the task
   * surface in the current appearance (theme tokens, not hard-coded).
   */
  shouldSeeTaskPlaceReadable(): Promise<void>;

  /**
   * Apply light/dark mode and default/tokyo-night palette (persisted,
   * then reload so the boot script paints html classes).
   */
  useAppearance(appearance: {
    mode: 'light' | 'dark';
    colorTheme: 'default' | 'tokyo-night';
  }): Promise<void>;

  /**
   * Assert Inbox triage surface background (current page) differs from
   * the Today task surface background in this appearance.
   */
  shouldSeeInboxSurfaceDistinctFromTaskSurface(): Promise<void>;

  /**
   * Assert this capture's content includes an http(s) link to href.
   * Only the URL is the link; surrounding prose stays plain. The link
   * opens in a new tab (`target="_blank"`, `rel="noopener noreferrer"`).
   */
  shouldSeeCaptureContentLink(content: string, href: string): Promise<void>;

  /**
   * Assert this capture's content is plain text with no content links.
   */
  shouldSeeCaptureContentWithoutLinks(content: string): Promise<void>;

  /**
   * Assert the existing source link under the body is still present.
   */
  shouldSeeCaptureSourceUrl(content: string, href: string): Promise<void>;

  /**
   * Open the http(s) content link. Opens a new tab. Must not Promote,
   * Snooze, or Trash the capture.
   */
  openCaptureContentLink(content: string, href: string): Promise<void>;

  /**
   * Assert the Inbox-tab quick-add capture field is visible.
   */
  shouldSeeQuickAddCapture(): Promise<void>;

  /**
   * Assert the Inbox-tab quick-add capture field is not on this pane.
   */
  shouldNotSeeQuickAddCapture(): Promise<void>;

  /**
   * Assert the Inbox quick-capture field is not on this screen
   * (task piles still have their own Add-task control).
   */
  shouldNotSeeQuickCaptureField(): Promise<void>;

  /**
   * Desktop: press the app’s quick-capture shortcut (⌘K / Ctrl+K).
   */
  pressQuickCaptureShortcut(): Promise<void>;

  /**
   * Type into the focused Inbox quick-capture field and submit.
   * The capture lands in Inbox.
   */
  submitFocusedQuickCapture(content: string): Promise<void>;

  /**
   * Assert the Inbox quick-capture field is focused and ready to type.
   */
  shouldHaveQuickCaptureFocused(): Promise<void>;

  /**
   * Assert the desktop ⌘K / Ctrl+K hint is visible on the capture field.
   */
  shouldSeeQuickCaptureShortcutHint(): Promise<void>;

  /**
   * Assert the desktop shortcut hint is not shown.
   */
  shouldNotSeeQuickCaptureShortcutHint(): Promise<void>;

  /**
   * Assert the shortcut hint stays distinct from the field in this
   * appearance (theme tokens, not a hard-coded color).
   */
  shouldSeeQuickCaptureShortcutHintReadable(): Promise<void>;

  /**
   * Focus the Today / pile add-task field so typing goes there.
   */
  focusAddTaskField(): Promise<void>;

  /**
   * Focus the Edit Task title field (dialog must be open).
   */
  focusTaskEditTitle(): Promise<void>;

  /**
   * Type into whatever text field is focused (add-task, edit title, …).
   */
  typeIntoFocusedField(text: string): Promise<void>;

  /**
   * Assert the focused text field has this value.
   */
  shouldSeeFocusedFieldValue(value: string): Promise<void>;

  /**
   * Open Promote on an inbox capture. Opens the Promote sheet
   * (not the old centered Create Task dialog).
   */
  openPromoteSheet(content: string): Promise<void>;

  /**
   * Assert the Promote sheet is visible: title + list picker, not a
   * centered dialog as the destination.
   */
  shouldSeePromoteSheet(): Promise<void>;

  /**
   * Assert the Promote sheet title is prefilled with this text.
   */
  shouldSeePromoteTitlePrefill(title: string): Promise<void>;

  /**
   * Assert the Promote list picker is showing Unlisted (the default).
   */
  shouldSeePromoteListUnlisted(): Promise<void>;

  /**
   * Confirm Promote with Unlisted (omit listId). Returns the created task.
   */
  confirmPromoteUnlisted(): Promise<Task>;

  /**
   * Confirm Promote onto this named list. Returns the created task.
   */
  confirmPromoteOnList(listName: string): Promise<Task>;

  /**
   * Cancel the Promote sheet. The capture stays in Inbox.
   */
  cancelPromoteSheet(): Promise<void>;

  /**
   * Assert this capture is not visible on the current pane.
   */
  shouldNotSeeCaptureOnCurrentPane(content: string): Promise<void>;

  /**
   * Shrink the browser to a phone viewport (below the md rail breakpoint).
   */
  useMobileViewport(): Promise<void>;

  /**
   * Restore a wide desktop viewport (sidebar rail, no bottom tabs).
   * Optional size defaults to 1280×720.
   */
  useDesktopViewport(size?: { width: number; height: number }): Promise<void>;

  /**
   * Open the Edit Task project picker and leave the listbox open so a
   * walkthrough screenshot can capture the options (including this name).
   */
  openEditTaskProjectPicker(visibleProjectName: string): Promise<void>;

  /**
   * Open the quick-add project picker and leave the listbox open.
   */
  openCreateTaskProjectPicker(visibleProjectName: string): Promise<void>;

  /**
   * Open the Promote sheet project picker and leave the listbox open.
   */
  openPromoteProjectPicker(visibleProjectName: string): Promise<void>;

  /**
   * Close an open kit Select listbox (Escape) without saving the form.
   */
  dismissOpenSelect(): Promise<void>;

  /**
   * Save a viewport screenshot of the current page for PR walkthrough
   * review. `story` is the kebab-case artifacts folder (e.g.
   * `135-tasks-in-projects`). `step` is snake_case (e.g.
   * `edit_project_picker`).
   */
  saveWalkthroughScreenshot(input: {
    story: string;
    step: string;
    includeToasts?: boolean;
  }): Promise<void>;

  /**
   * Open Capture, Process, Work, or Review from the mobile bottom tabs.
   */
  openMobileBottomTab(tab: MobileTabKey): Promise<void>;

  /**
   * Assert which phone tab is lit, or that none is.
   */
  shouldSeeLitMobileTab(tab: MobileTabKey | null): Promise<void>;

  /**
   * Assert Process has settled (`data-process-ready`).
   */
  shouldSeeProcessReady(): Promise<void>;

  /**
   * Assert Process shows this capture as the current card.
   */
  shouldSeeProcessCurrent(content: string): Promise<void>;

  /**
   * Assert Process subcopy and marker say this many are left, including the current card.
   */
  shouldSeeProcessLeft(count: number): Promise<void>;

  /**
   * Assert the empty Process state names this many snoozed captures.
   */
  shouldSeeProcessSnoozedComingBack(count: number): Promise<void>;

  /**
   * Open Make it a task on the current Process card.
   */
  openProcessMakeTask(): Promise<void>;

  /**
   * Open New project or Someday project on the current Process card.
   */
  openProcessProjectSheet(status: 'active' | 'someday'): Promise<void>;

  /**
   * Assert the Process project sheet name and objective.
   */
  shouldSeeProcessProjectPrefill(input: { name: string; objective: string }): Promise<void>;

  /**
   * Edit the Process project sheet fields.
   */
  fillProcessProject(input: { name?: string; objective?: string }): Promise<void>;

  /**
   * Submit the Process project sheet and return the created project.
   */
  confirmProcessProject(): Promise<ProcessCaptureToProjectResult>;

  /**
   * Submit the Process project sheet and assert the inline error.
   */
  shouldSeeProcessProjectError(text: string): Promise<void>;

  /**
   * Close the Process project sheet.
   */
  cancelProcessProjectSheet(): Promise<void>;

  /**
   * Open the Process snooze menu.
   */
  openProcessSnoozeMenu(): Promise<void>;

  /**
   * Pick a Process snooze option.
   */
  pickProcessSnooze(option: 'later-today' | 'tomorrow' | 'next-week'): Promise<void>;

  /**
   * Trash the current Process card.
   */
  trashProcessCurrent(): Promise<void>;

  /**
   * Assert the current Process card shows this source URL label.
   */
  shouldSeeProcessSourceUrl(label: string): Promise<void>;

  /**
   * Press a Process desktop key (T, P, S, Z, Delete, Backspace).
   */
  pressProcessKey(key: 't' | 'p' | 's' | 'z' | 'Delete' | 'Backspace'): Promise<void>;

  /**
   * Press Delete, hold the trash POST so the next card is showing while
   * the first save is still in flight, press Delete again, then release.
   */
  pressProcessDeleteWhileTrashHeld(): Promise<void>;

  /**
   * Press Delete against a 500 trash POST, wait for that 500 and for
   * the key lock to release, press Delete again, and assert the second
   * trash POST happens.
   */
  pressProcessDeleteAfterTrashError(): Promise<void>;

  /**
   * Assert desktop Process key hints are showing.
   */
  shouldSeeProcessKeyHints(): Promise<void>;

  /**
   * Assert every Process action button sits inside the current card.
   */
  shouldSeeProcessActionsFitCard(): Promise<void>;

  /**
   * Assert the Undo toast with this message is showing.
   */
  shouldSeeUndoToast(message: string): Promise<void>;

  /**
   * Assert a toast with this message is showing (Undo not required).
   * Waits through the live-query refresh that Review Undo runs first.
   */
  shouldSeeToast(message: string): Promise<void>;

  /**
   * Assert no visible toast contains this message.
   */
  shouldNotSeeToast(message: string): Promise<void>;

  /**
   * Click Undo on the toast with this message.
   */
  undoFromToast(message: string): Promise<void>;

  /**
   * Click Undo on a Review next-action toast and return the PUT
   * `/api/projects/:id/next-action` plus the created-task DELETE.
   * Settles on those network responses. The restore toast is asserted
   * separately after the live-query refresh. Pass `deleteFails` to
   * fulfill that DELETE with 500.
   */
  undoReviewNextActionFromToast(
    message: string,
    options?: { deleteFails?: boolean }
  ): Promise<{
    method: string;
    url: string;
    requestBody: unknown;
    status: number;
    deletedUrl: string | null;
    deletedStatus: number | null;
    deletedBody: string | null;
    savedToastReappeared: boolean;
  }>;

  /**
   * Assert Process moved on because the current capture was processed elsewhere.
   */
  shouldSeeAlreadyProcessedNotice(): Promise<void>;

  /**
   * Assert the out-of-band processed toast is not showing.
   */
  shouldNotSeeAlreadyProcessedNotice(): Promise<void>;

  /**
   * Assert What’s next is not showing.
   */
  shouldNotSeeWhatsNext(): Promise<void>;

  /**
   * Assert the Task created toast with View is showing.
   */
  shouldSeeTaskCreatedToast(): Promise<void>;

  /**
   * Assert the Project created toast with View is showing.
   */
  shouldSeeProjectCreatedToast(): Promise<void>;

  /**
   * Assert the Process empty state and its Capture link.
   */
  shouldSeeProcessEmpty(): Promise<void>;

  /**
   * Assert the Process tab badge shows this count, or is hidden.
   */
  shouldSeeProcessBadge(count: number | null): Promise<void>;

  /**
   * Assert the phone pile-screen back link is showing.
   */
  shouldSeeBackToWork(): Promise<void>;

  /**
   * Assert the phone pile-screen back link is not showing.
   */
  shouldNotSeeBackToWork(): Promise<void>;

  /**
   * Tap ‹ Work and wait for Now to settle.
   */
  openBackToWork(): Promise<void>;

  /**
   * Assert Review shows the + New project button.
   */
  shouldSeeReviewNewProject(): Promise<void>;

  /**
   * Create a project from Review's + New project button.
   */
  createProjectFromReview(input: { name: string; objective?: string }): Promise<Project>;

  /**
   * Open a project from the Review / All projects list.
   */
  openProjectFromIndex(name: string): Promise<void>;

  /**
   * Follow the project page "All projects" back link.
   */
  openAllProjectsBackLink(): Promise<void>;

  /**
   * Open Process by URL and wait until it is ready.
   */
  openProcess(): Promise<void>;

  /**
   * Assert no desktop rail item is highlighted.
   */
  shouldSeeNoRailItemHighlighted(): Promise<void>;

  /**
   * Open a project from the rail / phone drawer.
   */
  openRailProject(name: string): Promise<void>;

  /**
   * Confirm Promote onto this named list and project.
   */
  confirmPromoteOnListAndProject(input: {
    listName: string;
    projectName: string;
    dueDate?: string;
  }): Promise<Task>;

  /**
   * Assert the last matching node sits above the phone tab bar.
   */
  shouldSeeClearOfMobileTabBar(selector: string): Promise<void>;

  /**
   * Snooze this capture on the current pane (Capture or Process).
   */
  snoozeCaptureOnCurrentPane(content: string): Promise<void>;

  /**
   * Trash this capture with the card Trash button on the current pane.
   */
  trashCaptureOnCurrentPane(content: string): Promise<void>;

  /**
   * Assert the mobile bottom nav shows exactly these tabs, in order.
   */
  shouldSeeMobileBottomTabs(labels: string[]): Promise<void>;

  /**
   * Assert this label is not a mobile bottom tab (no Lists / All / third tab).
   */
  shouldNotSeeMobileBottomTab(label: string): Promise<void>;

  /**
   * Assert the desktop sidebar rail is showing and the mobile Tasks rail is not.
   */
  shouldSeeDesktopAppRail(): Promise<void>;

  /**
   * Assert the mobile bottom nav is not showing (wide layout).
   */
  shouldNotSeeMobileBottomNav(): Promise<void>;

  /**
   * Assert Tasks on a phone shows task content first — the rail drawer is
   * closed and does not occupy the screen. A control to open it is visible.
   */
  shouldSeeTasksContentWithoutMobileRail(): Promise<void>;

  /**
   * Open the mobile Tasks rail drawer (menu control).
   */
  openMobileTasksRail(): Promise<void>;

  /**
   * Assert the mobile Tasks rail drawer is open (flat rail visible).
   */
  shouldSeeMobileTasksRail(): Promise<void>;

  /**
   * Assert the mobile Tasks rail drawer is closed.
   */
  shouldNotSeeMobileTasksRail(): Promise<void>;

  /**
   * Assert this task row has a large complete control (aim ~44px), not a
   * multi-select checkbox.
   */
  shouldSeeLargeCompleteControlOnTask(taskId: string): Promise<void>;

  /**
   * Complete an open task by tapping/clicking the row complete control.
   * The task leaves the current open-task view.
   */
  completeOpenTaskFromRow(taskId: string): Promise<void>;

  /**
   * Complete this open task from the row while a slower GET of the named
   * list pile — snapshotted before the click — is allowed to land after
   * the optimistic update and before the complete POST settles. The
   * completed task must stay gone (stale poll must not restore it).
   */
  completeOpenTaskFromRowAgainstStalePilePoll(taskId: string, listId: string): Promise<void>;

  /**
   * Uncomplete a completed task by tapping/clicking the row complete control.
   * The task leaves the current completed view (Done).
   */
  uncompleteTaskFromRow(taskId: string): Promise<void>;

  /**
   * Complete an open task by swiping the row right (touch / phone).
   * Same outcome as the complete control: the task leaves the open view.
   */
  completeOpenTaskBySwipe(taskId: string): Promise<void>;

  /**
   * Scroll the task list vertically, including a vertical-dominant gesture
   * on this row. The task must still be present — no accidental complete.
   */
  scrollTaskListWithoutCompleting(taskId: string): Promise<void>;

  /**
   * Drag the task row horizontally with a mouse. Desktop stays tap-only:
   * the task must still be present.
   */
  shouldKeepTaskAfterDesktopRowDrag(taskId: string): Promise<void>;

  /**
   * Drag the task row vertically on the body (not the grip). Must not
   * complete the task — swipe stays horizontal; drag is the handle.
   */
  shouldKeepTaskAfterVerticalRowDrag(taskId: string): Promise<void>;

  /**
   * Assert the complete circle and first title line share one visual
   * centerline. Complete (and grip, when shown) stay ~44px hit targets.
   */
  shouldSeeTaskRowAlignedWithTitle(taskId: string): Promise<void>;

  /**
   * Assert due/assignee/list metadata sits under the title and does not
   * pull the complete circle off the first title line.
   */
  shouldSeeTaskRowMetadataBelowTitle(taskId: string): Promise<void>;

  /**
   * Assert the title wraps to more than one line and the complete circle
   * still sits on the first line.
   */
  shouldSeeWrappedTaskTitle(taskId: string): Promise<void>;

  /**
   * Delete this task from Edit → Delete (confirm the kit dialog). The
   * task leaves the current view.
   */
  deleteOpenTaskFromRow(taskId: string): Promise<void>;

  /**
   * Assert tapping the title opens the existing edit dialog.
   */
  shouldNotOpenTaskEditFromTitle(taskId: string): Promise<void>;

  /**
   * Assert tapping the complete circle does not open Edit.
   */
  shouldNotOpenTaskEditFromComplete(taskId: string): Promise<void>;

  /**
   * Assert tapping a row in reorder mode does not open Edit.
   */
  shouldNotOpenTaskEditInReorderMode(taskId: string): Promise<void>;

  /**
   * Assert this task row has no ⋯ / pencil / trash, and tapping the
   * title opens the existing edit dialog.
   */
  shouldSeeTaskEditControl(taskId: string): Promise<void>;

  /**
   * Open the existing task edit modal/sheet by tapping the row body.
   */
  openTaskEditFromRow(taskId: string): Promise<void>;

  /**
   * Assert the open Edit Task dialog shows added, last changed, and
   * (when completed) completed timestamps.
   */
  shouldSeeTaskEditChangeHistory(options?: {
    lastChangedBeforeHistory?: boolean;
    completed?: boolean;
    changedBy?: string;
  }): Promise<void>;

  /**
   * Normal-mode one-pile row: complete + title only. No grip, ⋯,
   * pencil, trash, or pin.
   */
  shouldSeeOnePileTaskRowChrome(taskId: string): Promise<void>;

  /**
   * Smart-view row: complete + title only. No grip, ⋯, pencil, trash,
   * or pin.
   */
  shouldSeeSmartViewTaskRowChrome(taskId: string): Promise<void>;

  /**
   * Open edit from the row and assert Delete is in the dialog.
   */
  shouldSeeTaskRowOverflowActions(taskId: string): Promise<void>;

  /**
   * Assert this row’s title and complete control stay readable against
   * the task surface (theme tokens, not washed-out).
   */
  shouldSeeTaskRowChromeReadable(taskId: string): Promise<void>;

  /**
   * Assert the open dialog is the existing task edit UI (same fields).
   */
  shouldSeeExistingTaskEditUi(): Promise<void>;

  /**
   * Close the task edit modal/sheet without saving.
   */
  closeTaskEdit(): Promise<void>;

  /**
   * Save the open task edit dialog.
   */
  saveOpenTaskEdit(): Promise<void>;

  /**
   * Assert the Today / pile create-task list picker includes this named list.
   */
  shouldSeeNamedListInCreateTaskPicker(name: string): Promise<void>;

  /**
   * Shorten the live-query interval for this page (E2E only) and refetch now.
   */
  useShortLiveQueryInterval(intervalMs?: number): Promise<void>;

  /**
   * Wait until a live GET of this named list's open tasks has a body that
   * matches. Ignores in-flight GETs whose JSON is still the old pile.
   * Start this before the out-of-band write so a fast poll is not missed.
   */
  awaitLiveOpenListTasks(
    listId: string,
    matches: (tasks: Array<{ id: string; title: string }>) => boolean
  ): Promise<void>;

  /**
   * Wait until a live GET of named lists has a body that matches.
   * Start this before the out-of-band write.
   */
  awaitLiveNamedLists(
    matches: (lists: Array<{ id: string; name: string }>) => boolean
  ): Promise<void>;

  /**
   * Wait until a live GET of inbox captures has a body that matches.
   * Start this before the out-of-band write.
   */
  awaitLiveInboxCaptures(
    matches: (captures: Array<{ id: string; content: string }>) => boolean
  ): Promise<void>;

  /**
   * Wait until a live GET of Now next actions has a body that matches.
   * Start this before the out-of-band write.
   */
  awaitLiveNowNextActions(
    matches: (items: Array<{ title: string; project: string }>) => boolean
  ): Promise<void>;

  /**
   * Hide the document (backgrounded app / hidden tab) so live checks must stop.
   */
  hideApp(): Promise<void>;

  /**
   * Show the document again. Live checks must run immediately, as on focus today.
   */
  showApp(): Promise<void>;

  /**
   * Count GET requests to tasks/lists/captures/unlisted during this window.
   */
  countLiveDataGetsDuring(durationMs: number): Promise<number>;

  /**
   * Fail subsequent live-data GETs (server down / no signal) without going offline.
   */
  failBackgroundLiveQueries(): Promise<void>;

  /**
   * Stop failing live-data GETs so the next check can catch up.
   */
  restoreBackgroundLiveQueries(): Promise<void>;

  /**
   * Assert no query error card, connect banner, or toast is showing.
   */
  shouldNotSeeQueryError(): Promise<void>;

  /**
   * Assert the page is not showing the initial "Loading..." placeholder.
   */
  shouldNotSeeLoadingPlaceholder(): Promise<void>;

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
  renameNamedList(id: string, name: string): Promise<NamedList>;
  deleteNamedList(id: string): Promise<void>;
  listOpenTasksOnList(listId: string): Promise<Task[]>;
  listOpenTasksOnProject(projectId: string): Promise<Task[]>;
  listFinishedTasksOnProject(
    projectId: string,
    query?: { limit?: number; cursor?: string }
  ): Promise<FinishedTaskPage>;
  listProjectHistory(
    projectId: string,
    query?: { limit?: number; cursor?: string }
  ): Promise<HistoryPage>;
  listTaskHistory(
    taskId: string,
    query?: { limit?: number; cursor?: string }
  ): Promise<HistoryPage>;
  expectInvalidProjectHistoryCursor(
    projectId: string,
    cursor: string
  ): Promise<{ message: string; code: string }>;
  reorderOpenTasksOnList(listId: string, taskIds: string[]): Promise<Task[]>;
  listUnlistedOpenTasks(): Promise<Task[]>;
  reorderUnlistedOpenTasks(taskIds: string[]): Promise<Task[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput): Promise<Task>;
};
