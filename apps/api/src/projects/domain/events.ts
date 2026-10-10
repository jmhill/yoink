export type ProjectCreated = {
  type: 'ProjectCreated';
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  objective?: string;
  status: 'active';
  createdAt: string;
  occurredAt: string;
};

export type ProjectUpdated = {
  type: 'ProjectUpdated';
  id: string;
  organizationId: string;
  name?: string;
  objective?: string | null;
  occurredAt: string;
};

export type ProjectEvent = ProjectCreated | ProjectUpdated;
