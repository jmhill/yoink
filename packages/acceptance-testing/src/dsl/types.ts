/**
 * Domain types for acceptance tests.
 * These represent the core entities in our domain.
 */

// =============================================================================
// Entities
// =============================================================================

export type Capture = {
  id: string;
  content: string;
  title?: string;
  status: 'inbox' | 'trashed' | 'processed';
  sourceUrl?: string;
  sourceApp?: string;
  organizationId: string;
  createdById: string;
  capturedAt: string;
  trashedAt?: string;
  snoozedUntil?: string;
  // Processing fields - populated when capture is converted to task/note
  processedAt?: string;
  processedToType?: 'task' | 'note' | 'project';
  processedToId?: string;
};

export type NamedList = {
  id: string;
  name: string;
  organizationId: string;
  createdById: string;
  createdAt: string;
};

export type TimelineActor = {
  userId: string | null;
  kind: 'user' | 'bot' | null;
  name: string | null;
};

export type TimelineSubject = {
  type: 'task' | 'project' | 'note';
  id: string;
  title: string | null;
  deleted: boolean;
};

export type Note = {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  body: string;
  version: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
};

export type NoteListItem = {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  excerpt: string;
  version: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
};

export type NoteListPage = {
  notes: NoteListItem[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export type NoteChange =
  | (Note & { kind: 'upserted'; projectName: string })
  | {
      kind: 'deleted';
      id: string;
      projectId: string;
      projectName: string;
      createdAt: string;
      deletedAt: string;
    };

export type NoteChangePage = {
  changes: NoteChange[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export type TimelineEntry = {
  id: string;
  kind: string;
  occurredAt: string;
  actor: TimelineActor;
  subject: TimelineSubject;
  details: { kind: string; [key: string]: unknown };
};

export type HistoryPage = {
  entries: TimelineEntry[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
  historyStartsAt: string;
};

export type FinishedTaskPage = {
  tasks: Task[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export type NotebookPage = {
  path: string;
  url: string;
};

export type Project = {
  id: string;
  name: string;
  organizationId: string;
  createdById: string;
  createdAt: string;
  objective?: string;
  status: 'active' | 'waiting' | 'someday' | 'done' | 'proposed' | 'declined';
  waitingOn?: string | null;
  waitingSince?: string | null;
  nextActionTaskId?: string | null;
  notebookPages?: NotebookPage[];
  reason?: string;
  suggestedNextAction?: string;
  lastChangedAt?: string | null;
  lastChangedBy?: string | null;
};

export type CreateProjectInput = {
  name: string;
  objective?: string;
  status?: 'active' | 'someday' | 'proposed';
  reason?: string;
  suggestedNextAction?: string;
};

export type ListProjectsQuery = {
  status?: string;
  createdById?: string;
};

export type ConfirmProjectProposalInput = {
  name?: string;
  objective?: string | null;
  status?: 'active' | 'someday' | 'waiting';
  waitingOn?: string | null;
  waitingSince?: string | null;
  suggestedNextAction?: string | null;
};

export type ConfirmProjectProposalResult = {
  project: Project;
  task?: { id: string; title: string };
};

export type ImportNewTask = {
  key: string;
  title: string;
  dueDate?: string;
  assigneeId?: string;
  listId?: string;
};

export type ImportProject = {
  name: string;
  objective?: string;
  status: 'active' | 'waiting' | 'someday' | 'done' | 'proposed';
  waitingOn?: string;
  waitingSince?: string | null;
  notebookPages?: string[];
  existingTaskIds?: string[];
  newTasks?: ImportNewTask[];
  nextAction?: { existingTaskId: string } | { newTaskKey: string } | null;
};

export type ImportPreviewWarning = {
  field: string;
  code: string;
  message: string;
};

export type ImportPreviewProject = {
  name: string;
  objective?: string;
  status: 'active' | 'waiting' | 'someday';
  waitingOn?: string | null;
  waitingSince?: string | null;
  nextActionTitle: string | null;
  tasks: Array<{
    title: string;
    source: 'existing' | 'new';
    dueDate?: string;
    assigneeName?: string;
  }>;
  notebookPages: NotebookPage[];
  warnings: ImportPreviewWarning[];
};

export type ImportPreview = {
  projects: ImportPreviewProject[];
  totals: {
    projectCount: number;
    existingTaskCount: number;
    newTaskCount: number;
    projectsWithNoNextAction: number;
  };
};

export type StagedImport = {
  id: string;
  status: 'pending' | 'applied' | 'discarded';
  createdById: string;
  createdByName: string;
  createdAt: string;
  decidedById: string | null;
  decidedAt: string | null;
  preview: ImportPreview | null;
  errors: Array<{
    index: number;
    name: string;
    field: string;
    code: string;
    message: string;
  }>;
};

export type AppliedImport = {
  id: string;
  status: 'applied';
  preview: ImportPreview;
  projects: Project[];
};

export type DiscardedImport = {
  id: string;
  status: 'discarded';
  decidedById: string;
  decidedAt: string;
};

export type Task = {
  id: string;
  title: string;
  organizationId: string;
  createdById: string;
  captureId?: string; // Source capture, if any
  dueDate?: string; // YYYY-MM-DD format
  completedAt?: string;
  pinnedAt?: string;
  createdAt: string;
  assigneeId?: string;
  listId?: string;
  projectId?: string;
  openOrder?: number;
  lastChangedAt?: string | null;
  lastChangedBy?: string | null;
  completedBy?: string | null;
  completedByName?: string;
};

export type NowOwner = 'all' | 'me';

export type NowQuery = {
  owner?: NowOwner;
  timeZone?: string;
  limit?: number;
  cursor?: string;
};

export type ReviewReason = 'noNextAction' | 'quiet' | 'waiting';

export type ReviewQuery = {
  timeZone?: string;
  limit?: number;
  cursor?: string;
};

export type DoneListQuery = {
  week?: string;
  limit?: number;
  cursor?: string;
};

export type DoneListNextAction = {
  id: string;
  title: string;
};

export type DoneListGroup = {
  project: Project;
  nextAction: DoneListNextAction | null;
  tasks: Task[];
};

export type DoneListPage = {
  timeZone: string;
  week: { start: string; end: string };
  previousWeek: string;
  nextWeek: string | null;
  groups: DoneListGroup[];
  otherTaskCount: number;
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export type ReviewNextAction = {
  id: string;
  title: string;
  dueDate: string | null;
};

export type ReviewProjectItem = {
  project: Project;
  reasons: ReviewReason[];
  lastChangeAt: string;
  daysSinceChange: number;
  daysWaiting: number | null;
  nextAction: ReviewNextAction | null;
};

export type ReviewPage = {
  today: string;
  projects: ReviewProjectItem[];
  counts: { noNextAction: number; quiet: number; waiting: number };
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export type NowNextActionItem = {
  task: Task;
  project: { id: string; name: string };
};

export type NowNextActionsPage = {
  items: NowNextActionItem[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export type TaskListPage = {
  tasks: Task[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export type WorkListItem = {
  id: string;
  name: string;
  openTaskCount: number;
};

export type WorkListsPage = {
  lists: WorkListItem[];
  unlisted: { openTaskCount: number };
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export type NowNextActionRow = {
  title: string;
  project: string;
  owner: string;
};

export type NowDueRow = {
  title: string;
  owner: string;
};

export type NowListRow = {
  id: string;
  name: string;
  count: number;
};

export type Organization = {
  id: string;
  name: string;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
  createdAt: string;
};

export type Token = {
  id: string;
  name: string | null;
  userId?: string;
  lastUsedAt?: string;
  createdAt: string;
};

export type PasskeyCredentialInfo = {
  id: string;
  name?: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt?: string;
};

export type Invitation = {
  id: string;
  code: string;
  email: string | null;
  organizationId: string;
  role: 'admin' | 'member';
  expiresAt: string;
  createdAt: string;
};

export type CreateInvitationInput = {
  role?: 'admin' | 'member';
  email?: string;
  expiresInDays?: number;
};

export type Member = {
  userId: string;
  email: string;
  name?: string;
  kind: 'human' | 'agent';
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
};

export type MintedAgent = {
  agent: {
    userId: string;
    name: string;
    kind: 'agent';
    role: 'owner' | 'admin' | 'member';
  };
  token: Token;
  rawToken: string;
};

// =============================================================================
// Input Types
// =============================================================================

export type CreateCaptureInput = {
  content: string;
  title?: string;
  sourceUrl?: string;
  sourceApp?: string;
};

// Content-only updates - explicit operations handle status/pin/snooze
export type UpdateCaptureInput = {
  content?: string;
  title?: string;
};

export type TaskFilter = 'today' | 'upcoming' | 'all' | 'completed' | 'mine';

export type CreateTaskInput = {
  title: string;
  dueDate?: string; // YYYY-MM-DD format
  assigneeId?: string;
  listId?: string; // create already on a named list; omit for unlisted
  projectId?: string; // create already in a project; omit for no project
};

export type UpdateTaskInput = {
  title?: string;
  dueDate?: string | null; // null to clear, undefined to keep unchanged
  assigneeId?: string | null;
  listId?: string | null; // set, replace, or null to take off; omit to leave unchanged
  projectId?: string | null; // set, replace, or null to clear; omit to leave unchanged
};

export type ProcessCaptureToTaskInput = {
  title?: string; // Defaults to capture content
  dueDate?: string; // YYYY-MM-DD format
  listId?: string; // optional single list bucket; omit for unlisted
  projectId?: string; // optional project; omit for no project
};

export type ProcessCaptureToProjectInput = {
  name: string;
  objective?: string;
  status: 'active' | 'someday';
};

export type ProcessCaptureToProjectResult = {
  project: Project;
  capture: Capture;
};

// =============================================================================
// Result Types
// =============================================================================

export type CreateTokenResult = {
  token: Token;
  rawToken: string;
};

export type HealthStatus = {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
};

export type PublicFileHeaders = {
  statusCode: number;
  cacheControl: string | undefined;
  contentType: string | undefined;
  body: string;
};

export type AcceptInvitationResult = {
  organizationId: string;
  organizationName: string;
  role: 'admin' | 'member';
};
