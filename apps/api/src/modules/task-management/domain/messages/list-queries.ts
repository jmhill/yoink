export type ListNamedListsQuery = {
  organizationId: string;
  limit?: number;
  cursor?: string;
};

export type ListOpenTasksOnListQuery = {
  listId: string;
  organizationId: string;
  limit?: number;
  cursor?: string;
};

export type ListUnlistedOpenTasksQuery = {
  organizationId: string;
  limit?: number;
  cursor?: string;
};
