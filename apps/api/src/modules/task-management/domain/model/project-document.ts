/** Project document. The module owns this shape. Edges map it onto the contract project. */

export const PROJECT_STATUSES = [
  'active',
  'waiting',
  'someday',
  'done',
  'proposed',
  'declined',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type AssignableProjectStatus = 'active' | 'waiting' | 'someday' | 'done';

export const isProjectStatus = (value: string): value is ProjectStatus =>
  (PROJECT_STATUSES as readonly string[]).includes(value);

/** Default project list. Proposed and declined are opt-in. */
export const WORKING_PROJECT_STATUSES = [
  'active',
  'waiting',
  'someday',
  'done',
] as const satisfies readonly ProjectStatus[];

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
