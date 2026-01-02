import type { OrganizationStorageError, MembershipStorageError } from '../../organizations/domain/organization-errors.js';
import type { UserStorageError } from '../../users/domain/user-errors.js';
import type { TokenStorageError } from '../../auth/domain/auth-errors.js';

// Re-export storage errors for convenience
export type { OrganizationStorageError, MembershipStorageError, UserStorageError, TokenStorageError };

// Admin-specific error types
export type OrganizationNotFoundError = {
  readonly type: 'ORGANIZATION_NOT_FOUND';
  readonly organizationId: string;
};

export type UserNotFoundError = {
  readonly type: 'USER_NOT_FOUND';
  readonly userId: string;
};

export type TokenNotFoundError = {
  readonly type: 'TOKEN_NOT_FOUND';
  readonly tokenId: string;
};

// Union type for all admin service errors
export type AdminServiceError =
  | OrganizationStorageError
  | MembershipStorageError
  | UserStorageError
  | TokenStorageError
  | OrganizationNotFoundError
  | UserNotFoundError
  | TokenNotFoundError;

// Factory functions
export const organizationNotFoundError = (
  organizationId: string
): OrganizationNotFoundError => ({
  type: 'ORGANIZATION_NOT_FOUND',
  organizationId,
});

export const userNotFoundError = (userId: string): UserNotFoundError => ({
  type: 'USER_NOT_FOUND',
  userId,
});

export const tokenNotFoundError = (tokenId: string): TokenNotFoundError => ({
  type: 'TOKEN_NOT_FOUND',
  tokenId,
});
