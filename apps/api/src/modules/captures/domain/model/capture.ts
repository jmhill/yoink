/** Capture document. The module owns this shape. Edges map it onto contract types. */

export const CAPTURE_STATUSES = ['inbox', 'trashed', 'processed'] as const;

export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export const PROCESSED_TO_TYPES = ['task', 'note', 'project'] as const;

export type ProcessedToType = (typeof PROCESSED_TO_TYPES)[number];

export type Capture = {
  id: string;
  organizationId: string;
  createdById: string;
  content: string;
  title?: string;
  sourceUrl?: string;
  sourceApp?: string;
  status: CaptureStatus;
  capturedAt: string;
  trashedAt?: string;
  snoozedUntil?: string;
  processedAt?: string;
  processedToType?: ProcessedToType;
  processedToId?: string;
};
