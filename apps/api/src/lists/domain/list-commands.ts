export type CreateNamedListCommand = {
  name: string;
  organizationId: string;
  createdById: string;
};

export type DeleteNamedListCommand = {
  id: string;
  organizationId: string;
};
