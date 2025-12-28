// ============================================================================
// User Storage Errors
// ============================================================================

export type UserStorageError = {
  readonly type: 'USER_STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export const userStorageError = (
  message: string,
  cause?: unknown
): UserStorageError => ({
  type: 'USER_STORAGE_ERROR',
  message,
  cause,
});

// ============================================================================
// User Service Errors
// ============================================================================

export type UserNotFoundError = {
  readonly type: 'USER_NOT_FOUND';
  readonly userId: string;
};

export const userNotFoundError = (userId: string): UserNotFoundError => ({
  type: 'USER_NOT_FOUND',
  userId,
});

export type UserServiceError =
  | UserNotFoundError
  | UserStorageError;
