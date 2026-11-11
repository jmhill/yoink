/** Task row on a finished-task page. The module owns this shape. The edge maps it onto the contract task. */

export type ListedTask = {
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
