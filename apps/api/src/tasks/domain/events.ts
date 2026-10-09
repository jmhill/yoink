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
  openOrder: number;
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
  openOrder?: number; // set when joining a pile (list or unlisted)
};

export type TaskCompleted = {
  type: 'TaskCompleted';
  id: string;
  organizationId: string;
  completedAt: string;
};

export type TaskUncompleted = {
  type: 'TaskUncompleted';
  id: string;
  organizationId: string;
  openOrder: number;
  siblingOrders: { id: string; openOrder: number }[];
};

export type TaskDeleted = {
  type: 'TaskDeleted';
  id: string;
  organizationId: string;
  captureId?: string;
  deletedAt: string;
};

export type TaskPinned = {
  type: 'TaskPinned';
  id: string;
  organizationId: string;
  pinnedAt: string;
};

export type TaskUnpinned = {
  type: 'TaskUnpinned';
  id: string;
  organizationId: string;
};

export type Noop = {
  type: 'Noop';
};

export type TaskEvent =
  | TaskCreated
  | TaskUpdated
  | TaskCompleted
  | TaskUncompleted
  | TaskDeleted
  | TaskPinned
  | TaskUnpinned;
