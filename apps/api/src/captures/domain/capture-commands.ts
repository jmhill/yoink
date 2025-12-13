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
