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
  /** Named list id, or null for the unlisted open pile. */
  listId: string | null;
  organizationId: string;
  taskIds: string[];
};
