export type CaptureCreated = {
  type: 'CaptureCreated';
  id: string;
  organizationId: string;
  createdById: string;
  content: string;
  title?: string;
  sourceUrl?: string;
  sourceApp?: string;
  capturedAt: string;
};

export type CaptureContentUpdated = {
  type: 'CaptureContentUpdated';
  id: string;
  organizationId: string;
  title?: string;
  content?: string;
};

export type CaptureTrashed = {
  type: 'CaptureTrashed';
  id: string;
  organizationId: string;
  trashedAt: string;
};

export type CaptureRestored = {
  type: 'CaptureRestored';
  id: string;
  organizationId: string;
};

export type CaptureSnoozed = {
  type: 'CaptureSnoozed';
  id: string;
  organizationId: string;
  until: string;
};

export type CaptureUnsnoozed = {
  type: 'CaptureUnsnoozed';
  id: string;
  organizationId: string;
};

export type CaptureDeleted = {
  type: 'CaptureDeleted';
  id: string;
  organizationId: string;
};

export type CaptureTrashEmptied = {
  type: 'CaptureTrashEmptied';
  organizationId: string;
};

export type Noop = {
  type: 'Noop';
};

export type CaptureEvent =
  | CaptureCreated
  | CaptureContentUpdated
  | CaptureTrashed
  | CaptureRestored
  | CaptureSnoozed
  | CaptureUnsnoozed
  | CaptureDeleted
  | CaptureTrashEmptied;
