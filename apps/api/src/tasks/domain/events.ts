export type TaskUpdated = {
  type: 'TaskUpdated';
  id: string;
  organizationId: string;
  title?: string;
  dueDate?: string | null;
  assigneeId?: string | null;
  listId?: string;
};

export type Noop = {
  type: 'Noop';
};

export type TaskEvent = TaskUpdated;
