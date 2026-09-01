export type ListNamedListsQuery = {
  organizationId: string;
};

export type ListOpenTasksOnListQuery = {
  listId: string;
  organizationId: string;
};

export type ListUnlistedOpenTasksQuery = {
  organizationId: string;
};
