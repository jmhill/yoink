/** Task document. The module owns this shape. Edges map it onto the contract task. */

export const TASK_FILTERS = ['today', 'upcoming', 'all', 'completed', 'mine'] as const;

export type TaskFilter = (typeof TASK_FILTERS)[number];

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
