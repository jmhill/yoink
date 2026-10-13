export type NoteCreated = {
  type: 'NoteCreated';
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  body: string;
  version: string;
  createdById: string;
  createdAt: string;
  occurredAt: string;
};

export type NoteUpdated = {
  type: 'NoteUpdated';
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  body?: string;
  titleChanged: boolean;
  bodyChanged: boolean;
  version: string;
  occurredAt: string;
};

export type NoteDeleted = {
  type: 'NoteDeleted';
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  deletedAt: string;
  occurredAt: string;
};

export type NoteEvent = NoteCreated | NoteUpdated | NoteDeleted;
