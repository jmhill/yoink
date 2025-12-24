export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type CaptureNotFoundError = {
  readonly type: 'CAPTURE_NOT_FOUND';
  readonly captureId: string;
};

export type CaptureAlreadyTrashedError = {
  readonly type: 'CAPTURE_ALREADY_TRASHED';
  readonly captureId: string;
};

export type InvalidSnoozeTimeError = {
  readonly type: 'INVALID_SNOOZE_TIME';
  readonly message: string;
};

export type CaptureNotInTrashError = {
  readonly type: 'CAPTURE_NOT_IN_TRASH';
  readonly captureId: string;
};

export type CaptureNotInInboxError = {
  readonly type: 'CAPTURE_NOT_IN_INBOX';
  readonly captureId: string;
};

export type CreateCaptureError = StorageError;
export type ListCapturesError = StorageError;
export type FindCaptureError = StorageError | CaptureNotFoundError;
export type UpdateCaptureError = StorageError | CaptureNotFoundError;

// Explicit operation errors
export type TrashCaptureError = StorageError | CaptureNotFoundError;
export type RestoreCaptureError = StorageError | CaptureNotFoundError;
export type SnoozeCaptureError = StorageError | CaptureNotFoundError | CaptureAlreadyTrashedError | InvalidSnoozeTimeError;
export type UnsnoozeCaptureError = StorageError | CaptureNotFoundError;
export type DeleteCaptureError = StorageError | CaptureNotFoundError | CaptureNotInTrashError;
export type EmptyTrashError = StorageError;

export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

export const captureNotFoundError = (captureId: string): CaptureNotFoundError => ({
  type: 'CAPTURE_NOT_FOUND',
  captureId,
});

export const captureAlreadyTrashedError = (captureId: string): CaptureAlreadyTrashedError => ({
  type: 'CAPTURE_ALREADY_TRASHED',
  captureId,
});

export const invalidSnoozeTimeError = (message: string): InvalidSnoozeTimeError => ({
  type: 'INVALID_SNOOZE_TIME',
  message,
});

export const captureNotInTrashError = (captureId: string): CaptureNotInTrashError => ({
  type: 'CAPTURE_NOT_IN_TRASH',
  captureId,
});

export const captureNotInInboxError = (captureId: string): CaptureNotInInboxError => ({
  type: 'CAPTURE_NOT_IN_INBOX',
  captureId,
});
