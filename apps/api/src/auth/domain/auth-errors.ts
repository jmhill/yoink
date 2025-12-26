export type UserStorageError = {
  readonly type: 'USER_STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type TokenStorageError = {
  readonly type: 'TOKEN_STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type OrganizationStorageError = {
  readonly type: 'ORGANIZATION_STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type MembershipStorageError = {
  readonly type: 'MEMBERSHIP_STORAGE_ERROR';
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

export const tokenStorageError = (
  message: string,
  cause?: unknown
): TokenStorageError => ({
  type: 'TOKEN_STORAGE_ERROR',
  message,
  cause,
});

export const organizationStorageError = (
  message: string,
  cause?: unknown
): OrganizationStorageError => ({
  type: 'ORGANIZATION_STORAGE_ERROR',
  message,
  cause,
});

export const membershipStorageError = (
  message: string,
  cause?: unknown
): MembershipStorageError => ({
  type: 'MEMBERSHIP_STORAGE_ERROR',
  message,
  cause,
});

// Service-level error types for TokenService

export type InvalidTokenFormatError = {
  readonly type: 'INVALID_TOKEN_FORMAT';
};

export type TokenNotFoundError = {
  readonly type: 'TOKEN_NOT_FOUND';
  readonly tokenId: string;
};

export type InvalidSecretError = {
  readonly type: 'INVALID_SECRET';
  readonly tokenId: string;
};

export type UserNotFoundError = {
  readonly type: 'USER_NOT_FOUND';
  readonly userId: string;
};

export type OrganizationNotFoundError = {
  readonly type: 'ORGANIZATION_NOT_FOUND';
  readonly organizationId: string;
};

export type TokenValidationError =
  | InvalidTokenFormatError
  | TokenNotFoundError
  | InvalidSecretError
  | UserNotFoundError
  | OrganizationNotFoundError
  | UserStorageError
  | TokenStorageError
  | OrganizationStorageError;

export const invalidTokenFormatError = (): InvalidTokenFormatError => ({
  type: 'INVALID_TOKEN_FORMAT',
});

export const tokenNotFoundError = (tokenId: string): TokenNotFoundError => ({
  type: 'TOKEN_NOT_FOUND',
  tokenId,
});

export const invalidSecretError = (tokenId: string): InvalidSecretError => ({
  type: 'INVALID_SECRET',
  tokenId,
});

export const userNotFoundError = (userId: string): UserNotFoundError => ({
  type: 'USER_NOT_FOUND',
  userId,
});

export const organizationNotFoundError = (organizationId: string): OrganizationNotFoundError => ({
  type: 'ORGANIZATION_NOT_FOUND',
  organizationId,
});
