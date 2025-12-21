export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type CaptureNotFoundError = {
  readonly type: 'CAPTURE_NOT_FOUND';
  readonly captureId: string;
};

export type CaptureAlreadyArchivedError = {
  readonly type: 'CAPTURE_ALREADY_ARCHIVED';
  readonly captureId: string;
};

export type InvalidSnoozeTimeError = {
  readonly type: 'INVALID_SNOOZE_TIME';
  readonly message: string;
};

export type CreateCaptureError = StorageError;
export type ListCapturesError = StorageError;
export type FindCaptureError = StorageError | CaptureNotFoundError;
export type UpdateCaptureError = StorageError | CaptureNotFoundError;

// Explicit operation errors
export type ArchiveCaptureError = StorageError | CaptureNotFoundError;
export type UnarchiveCaptureError = StorageError | CaptureNotFoundError;
export type PinCaptureError = StorageError | CaptureNotFoundError | CaptureAlreadyArchivedError;
export type UnpinCaptureError = StorageError | CaptureNotFoundError;
export type SnoozeCaptureError = StorageError | CaptureNotFoundError | CaptureAlreadyArchivedError | InvalidSnoozeTimeError;
export type UnsnoozeCaptureError = StorageError | CaptureNotFoundError;

export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

export const captureNotFoundError = (captureId: string): CaptureNotFoundError => ({
  type: 'CAPTURE_NOT_FOUND',
  captureId,
});

export const captureAlreadyArchivedError = (captureId: string): CaptureAlreadyArchivedError => ({
  type: 'CAPTURE_ALREADY_ARCHIVED',
  captureId,
});

export const invalidSnoozeTimeError = (message: string): InvalidSnoozeTimeError => ({
  type: 'INVALID_SNOOZE_TIME',
  message,
});
