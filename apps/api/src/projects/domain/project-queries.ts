export type ListProjectsQuery = {
  organizationId: string;
  limit?: number;
  cursor?: string;
};

export type GetProjectQuery = {
  id: string;
  organizationId: string;
};

export type ListOpenTasksOnProjectQuery = {
  projectId: string;
  organizationId: string;
  limit?: number;
  cursor?: string;
};
