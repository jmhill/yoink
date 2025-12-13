export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type CreateCaptureError = StorageError;
export type ListCapturesError = StorageError;

export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});
