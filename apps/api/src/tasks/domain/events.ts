export type TaskCreated = {
  type: 'TaskCreated';
  id: string;
  organizationId: string;
  createdById: string;
  title: string;
  dueDate?: string;
  captureId?: string;
  assigneeId?: string;
  listId?: string;
  createdAt: string;
};

export type TaskUpdated = {
  type: 'TaskUpdated';
  id: string;
  organizationId: string;
  title?: string;
  dueDate?: string | null;
  assigneeId?: string | null;
  listId?: string | null; // null clears to unlisted; omit leaves unchanged
};

export type Noop = {
  type: 'Noop';
};

export type TaskEvent = TaskCreated | TaskUpdated;
