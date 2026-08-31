export type NamedListCreated = {
  type: 'NamedListCreated';
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  createdAt: string;
};

export type NamedListEvent = NamedListCreated;
