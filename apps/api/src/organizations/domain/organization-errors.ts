import type { UserServiceError } from '../../users/domain/user-errors.js';

// ============================================================================
// Organization Storage Errors
// ============================================================================

export type OrganizationStorageError = {
  readonly type: 'ORGANIZATION_STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export const organizationStorageError = (
  message: string,
  cause?: unknown
): OrganizationStorageError => ({
  type: 'ORGANIZATION_STORAGE_ERROR',
  message,
  cause,
});

// ============================================================================
// Membership Storage Errors
// ============================================================================

export type MembershipStorageError = {
  readonly type: 'MEMBERSHIP_STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export const membershipStorageError = (
  message: string,
  cause?: unknown
): MembershipStorageError => ({
  type: 'MEMBERSHIP_STORAGE_ERROR',
  message,
  cause,
});

// ============================================================================
// Organization Service Errors
// ============================================================================

export type OrganizationNotFoundError = {
  readonly type: 'ORGANIZATION_NOT_FOUND';
  readonly organizationId: string;
};

export const organizationNotFoundError = (organizationId: string): OrganizationNotFoundError => ({
  type: 'ORGANIZATION_NOT_FOUND',
  organizationId,
});

export type OrganizationServiceError =
  | OrganizationNotFoundError
  | OrganizationStorageError;

// ============================================================================
// Membership Service Errors
// ============================================================================

/** User not found */
export type UserNotFoundError = {
  readonly type: 'USER_NOT_FOUND';
  readonly userId: string;
};

export const userNotFoundError = (userId: string): UserNotFoundError => ({
  type: 'USER_NOT_FOUND',
  userId,
});

/** User already has a membership in the organization */
export type AlreadyMemberError = {
  readonly type: 'ALREADY_MEMBER';
  readonly userId: string;
  readonly organizationId: string;
};

export const alreadyMemberError = (
  userId: string,
  organizationId: string
): AlreadyMemberError => ({
  type: 'ALREADY_MEMBER',
  userId,
  organizationId,
});

/** Membership not found */
export type MembershipNotFoundError = {
  readonly type: 'MEMBERSHIP_NOT_FOUND';
  readonly membershipId?: string;
  readonly userId?: string;
  readonly organizationId?: string;
};

export const membershipNotFoundError = (options: {
  membershipId?: string;
  userId?: string;
  organizationId?: string;
}): MembershipNotFoundError => ({
  type: 'MEMBERSHIP_NOT_FOUND',
  ...options,
});

/** Cannot remove owner from personal organization */
export type CannotLeavePersonalOrgError = {
  readonly type: 'CANNOT_LEAVE_PERSONAL_ORG';
  readonly userId: string;
  readonly organizationId: string;
};

export const cannotLeavePersonalOrgError = (
  userId: string,
  organizationId: string
): CannotLeavePersonalOrgError => ({
  type: 'CANNOT_LEAVE_PERSONAL_ORG',
  userId,
  organizationId,
});

/** Cannot change owner role */
export type CannotChangeOwnerRoleError = {
  readonly type: 'CANNOT_CHANGE_OWNER_ROLE';
  readonly membershipId: string;
};

export const cannotChangeOwnerRoleError = (
  membershipId: string
): CannotChangeOwnerRoleError => ({
  type: 'CANNOT_CHANGE_OWNER_ROLE',
  membershipId,
});

/** Organization must have at least one admin */
export type LastAdminError = {
  readonly type: 'LAST_ADMIN';
  readonly organizationId: string;
};

export const lastAdminError = (organizationId: string): LastAdminError => ({
  type: 'LAST_ADMIN',
  organizationId,
});

/** Insufficient permissions for the operation */
export type InsufficientPermissionsError = {
  readonly type: 'INSUFFICIENT_PERMISSIONS';
  readonly requiredRole: string;
  readonly actualRole: string;
};

export const insufficientPermissionsError = (
  requiredRole: string,
  actualRole: string
): InsufficientPermissionsError => ({
  type: 'INSUFFICIENT_PERMISSIONS',
  requiredRole,
  actualRole,
});

export type MembershipServiceError =
  | AlreadyMemberError
  | MembershipNotFoundError
  | CannotLeavePersonalOrgError
  | CannotChangeOwnerRoleError
  | LastAdminError
  | InsufficientPermissionsError
  | UserNotFoundError
  | OrganizationNotFoundError
  | MembershipStorageError
  | OrganizationStorageError
  | UserServiceError;
