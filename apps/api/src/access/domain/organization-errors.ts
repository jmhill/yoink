import {
  OWNER_CANNOT_BE_REMOVED_MESSAGE,
  OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE,
  OWNER_MUST_TRANSFER_MESSAGE,
} from '@yoink/api-contracts';
import type { UserNotFoundError, UserServiceError } from './user-errors.js';

export {
  OWNER_CANNOT_BE_REMOVED_MESSAGE,
  OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE,
  OWNER_MUST_TRANSFER_MESSAGE,
};

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

/** #190: fromUserId is not the current owner */
export type NotCurrentOwnerError = {
  readonly type: 'NOT_CURRENT_OWNER';
  readonly organizationId: string;
  readonly userId: string;
};

export const notCurrentOwnerError = (
  organizationId: string,
  userId: string
): NotCurrentOwnerError => ({
  type: 'NOT_CURRENT_OWNER',
  organizationId,
  userId,
});

/** Owner can only be assigned via the admin-panel set-owner command */
export type CannotAssignOwnerRoleError = {
  readonly type: 'CANNOT_ASSIGN_OWNER_ROLE';
  readonly message: string;
};

export const cannotAssignOwnerRoleError = (): CannotAssignOwnerRoleError => ({
  type: 'CANNOT_ASSIGN_OWNER_ROLE',
  message: 'Owner can only be set from the admin panel',
});

/** Owner cannot leave or be removed until ownership is transferred */
export type OwnerMustTransferError = {
  readonly type: 'OWNER_MUST_TRANSFER';
  readonly organizationId: string;
  readonly userId: string;
  readonly message: string;
};

export const ownerMustTransferError = (
  organizationId: string,
  userId: string
): OwnerMustTransferError => ({
  type: 'OWNER_MUST_TRANSFER',
  organizationId,
  userId,
  message: OWNER_MUST_TRANSFER_MESSAGE,
});

/** Anyone removing the owner — dedicated, not INSUFFICIENT_PERMISSIONS */
export type OwnerCannotBeRemovedError = {
  readonly type: 'OWNER_CANNOT_BE_REMOVED';
  readonly organizationId: string;
  readonly userId: string;
  readonly message: string;
};

export const ownerCannotBeRemovedError = (
  organizationId: string,
  userId: string
): OwnerCannotBeRemovedError => ({
  type: 'OWNER_CANNOT_BE_REMOVED',
  organizationId,
  userId,
  message: OWNER_CANNOT_BE_REMOVED_MESSAGE,
});

/** A workspace already has an owner; a second owner cannot be saved */
export type SecondOwnerError = {
  readonly type: 'SECOND_OWNER';
  readonly organizationId: string;
  readonly message: string;
};

export const secondOwnerError = (organizationId: string): SecondOwnerError => ({
  type: 'SECOND_OWNER',
  organizationId,
  message: 'A workspace can have at most one owner',
});

/** Bots can never be admin or owner */
export type BotCannotHavePrivilegedRoleError = {
  readonly type: 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE';
  readonly role: 'admin' | 'owner';
  readonly message: string;
};

export const botCannotHavePrivilegedRoleError = (
  role: 'admin' | 'owner'
): BotCannotHavePrivilegedRoleError => ({
  type: 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE',
  role,
  message:
    role === 'owner'
      ? 'A bot cannot be the workspace owner'
      : 'A bot cannot be an admin',
});

/** Set-owner target is not already a member of the workspace */
export type TargetNotWorkspaceMemberError = {
  readonly type: 'TARGET_NOT_WORKSPACE_MEMBER';
  readonly userId: string;
  readonly organizationId: string;
  readonly message: string;
};

export const targetNotWorkspaceMemberError = (
  userId: string,
  organizationId: string
): TargetNotWorkspaceMemberError => ({
  type: 'TARGET_NOT_WORKSPACE_MEMBER',
  userId,
  organizationId,
  message: 'Owner must already be a member of the workspace',
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

/** Closed union of membership command errors (no storage). */
export type MembershipError =
  | AlreadyMemberError
  | MembershipNotFoundError
  | CannotLeavePersonalOrgError
  | CannotAssignOwnerRoleError
  | OwnerMustTransferError
  | OwnerCannotBeRemovedError
  | NotCurrentOwnerError
  | SecondOwnerError
  | BotCannotHavePrivilegedRoleError
  | TargetNotWorkspaceMemberError
  | LastAdminError
  | InsufficientPermissionsError
  | UserNotFoundError
  | OrganizationNotFoundError;

export type MembershipServiceError =
  | MembershipError
  | MembershipStorageError
  | OrganizationStorageError
  | UserServiceError;
