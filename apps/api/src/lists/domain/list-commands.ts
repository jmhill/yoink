export type CreateNamedListCommand = {
  name: string;
  organizationId: string;
  createdById: string;
};

export type DeleteNamedListCommand = {
  id: string;
  organizationId: string;
};

export type ReorderOpenTasksCommand = {
  listId: string;
  organizationId: string;
  taskIds: string[];
};
