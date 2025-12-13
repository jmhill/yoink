export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type CaptureNotFoundError = {
  readonly type: 'CAPTURE_NOT_FOUND';
  readonly captureId: string;
};

export type CreateCaptureError = StorageError;
export type ListCapturesError = StorageError;
export type FindCaptureError = StorageError | CaptureNotFoundError;
export type UpdateCaptureError = StorageError | CaptureNotFoundError;

export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

export const captureNotFoundError = (captureId: string): CaptureNotFoundError => ({
  type: 'CAPTURE_NOT_FOUND',
  captureId,
});
