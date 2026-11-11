/**
 * Review documents. The module owns these shapes.
 * The public API edge maps them onto the contract review page and done page.
 * Project and task fields match the facts Task Management returns, so those
 * reads pass through the composition root without a second mapper.
 */

export const PROJECT_STATUSES = [
  'active',
  'waiting',
  'someday',
  'done',
  'proposed',
  'declined',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type NotebookPage = {
  path: string;
  url: string;
};

export type Project = {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  status: ProjectStatus;
  waitingOn: string | null;
  waitingSince: string | null;
  nextActionTaskId: string | null;
  notebookPages: NotebookPage[];
  createdAt: string;
  lastChangedAt: string | null;
  lastChangedBy: string | null;
  objective?: string;
  reason?: string;
  suggestedNextAction?: string;
};

export type Task = {
  id: string;
  organizationId: string;
  createdById: string;
  title: string;
  createdAt: string;
  lastChangedAt: string | null;
  lastChangedBy: string | null;
  completedBy: string | null;
  captureId?: string;
  dueDate?: string;
  completedAt?: string;
  pinnedAt?: string;
  assigneeId?: string;
  listId?: string;
  projectId?: string;
  openOrder?: number;
  completedByName?: string;
};

export type ReviewReason = 'noNextAction' | 'quiet' | 'waiting';

export type ReviewNextAction = {
  id: string;
  title: string;
  dueDate: string | null;
};

export type ReviewProject = {
  project: Project;
  reasons: readonly ReviewReason[];
  lastChangeAt: string;
  daysSinceChange: number;
  daysWaiting: number | null;
  nextAction: ReviewNextAction | null;
};

export type ReviewCounts = {
  noNextAction: number;
  quiet: number;
  waiting: number;
};
