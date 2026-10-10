export type NamedListCreated = {
  type: 'NamedListCreated';
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  createdAt: string;
  occurredAt: string;
};

export type NamedListDeleted = {
  type: 'NamedListDeleted';
  id: string;
  organizationId: string;
  occurredAt: string;
};

export type NamedListRenamed = {
  type: 'NamedListRenamed';
  id: string;
  organizationId: string;
  name: string;
  occurredAt: string;
};

export type OpenTasksReordered = {
  type: 'OpenTasksReordered';
  listId: string | null;
  organizationId: string;
  orders: { id: string; openOrder: number }[];
  occurredAt: string;
};

export type NamedListEvent = NamedListCreated | NamedListDeleted | NamedListRenamed;

export type ListEvent = NamedListEvent | OpenTasksReordered;
