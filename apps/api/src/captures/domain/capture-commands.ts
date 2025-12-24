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
  status?: 'inbox' | 'trashed';
  snoozed?: boolean; // true = only snoozed, false = exclude snoozed
  limit?: number;
  cursor?: string;
};

export type FindCaptureQuery = {
  id: string;
  organizationId: string;
};

// Content-only updates - explicit commands handle status/pin/snooze
export type UpdateCaptureCommand = {
  id: string;
  organizationId: string;
  title?: string;
  content?: string;
};

// Workflow operations
export type TrashCaptureCommand = {
  id: string;
  organizationId: string;
};

export type RestoreCaptureCommand = {
  id: string;
  organizationId: string;
};

// Display modifier operations
export type SnoozeCaptureCommand = {
  id: string;
  organizationId: string;
  until: string; // ISO datetime when snooze expires
};

export type UnsnoozeCaptureCommand = {
  id: string;
  organizationId: string;
};

// Deletion operations
export type DeleteCaptureCommand = {
  id: string;
  organizationId: string;
};

export type EmptyTrashCommand = {
  organizationId: string;
};
