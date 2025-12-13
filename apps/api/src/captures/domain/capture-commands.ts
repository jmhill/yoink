export type CreateCaptureCommand = {
  content: string;
  title?: string;
  sourceUrl?: string;
  sourceApp?: string;
  organizationId: string;
  createdById: string;
};

export type ListCapturesQuery = {
  organizationId: string;
  status?: 'inbox' | 'archived';
  limit?: number;
  cursor?: string;
};

export type FindCaptureQuery = {
  id: string;
  organizationId: string;
};

export type UpdateCaptureCommand = {
  id: string;
  organizationId: string;
  title?: string;
  content?: string;
  status?: 'inbox' | 'archived';
};
