// ============================================================================
// Invitation Storage Errors
// ============================================================================

export type InvitationStorageError = {
  readonly type: 'INVITATION_STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export const invitationStorageError = (
  message: string,
  cause?: unknown
): InvitationStorageError => ({
  type: 'INVITATION_STORAGE_ERROR',
  message,
  cause,
});

// ============================================================================
// Invitation Service Errors
// ============================================================================

/** Invitation not found */
export type InvitationNotFoundError = {
  readonly type: 'INVITATION_NOT_FOUND';
  readonly invitationId?: string;
  readonly code?: string;
};

export const invitationNotFoundError = (options: {
  invitationId?: string;
  code?: string;
}): InvitationNotFoundError => ({
  type: 'INVITATION_NOT_FOUND',
  ...options,
});

/** Invitation has expired */
export type InvitationExpiredError = {
  readonly type: 'INVITATION_EXPIRED';
  readonly code: string;
  readonly expiresAt: string;
};

export const invitationExpiredError = (
  code: string,
  expiresAt: string
): InvitationExpiredError => ({
  type: 'INVITATION_EXPIRED',
  code,
  expiresAt,
});

/** Invitation has already been accepted */
export type InvitationAlreadyAcceptedError = {
  readonly type: 'INVITATION_ALREADY_ACCEPTED';
  readonly code: string;
  readonly acceptedAt: string;
};

export const invitationAlreadyAcceptedError = (
  code: string,
  acceptedAt: string
): InvitationAlreadyAcceptedError => ({
  type: 'INVITATION_ALREADY_ACCEPTED',
  code,
  acceptedAt,
});

/** Email doesn't match the invitation's restricted email */
export type InvitationEmailMismatchError = {
  readonly type: 'INVITATION_EMAIL_MISMATCH';
  readonly code: string;
  readonly expectedEmail: string;
};

export const invitationEmailMismatchError = (
  code: string,
  expectedEmail: string
): InvitationEmailMismatchError => ({
  type: 'INVITATION_EMAIL_MISMATCH',
  code,
  expectedEmail,
});

/** User is already a member of the organization */
export type AlreadyMemberOfOrgError = {
  readonly type: 'ALREADY_MEMBER_OF_ORG';
  readonly userId: string;
  readonly organizationId: string;
};

export const alreadyMemberOfOrgError = (
  userId: string,
  organizationId: string
): AlreadyMemberOfOrgError => ({
  type: 'ALREADY_MEMBER_OF_ORG',
  userId,
  organizationId,
});

/** User with email already exists (during signup) */
export type EmailAlreadyExistsError = {
  readonly type: 'EMAIL_ALREADY_EXISTS';
  readonly email: string;
};

export const emailAlreadyExistsError = (email: string): EmailAlreadyExistsError => ({
  type: 'EMAIL_ALREADY_EXISTS',
  email,
});

/** Organization not found */
export type InvitationOrgNotFoundError = {
  readonly type: 'INVITATION_ORG_NOT_FOUND';
  readonly organizationId: string;
};

export const invitationOrgNotFoundError = (
  organizationId: string
): InvitationOrgNotFoundError => ({
  type: 'INVITATION_ORG_NOT_FOUND',
  organizationId,
});

/** User not found */
export type InvitationUserNotFoundError = {
  readonly type: 'INVITATION_USER_NOT_FOUND';
  readonly userId: string;
};

export const invitationUserNotFoundError = (
  userId: string
): InvitationUserNotFoundError => ({
  type: 'INVITATION_USER_NOT_FOUND',
  userId,
});

/** Insufficient permissions to create invitation */
export type InsufficientInvitePermissionsError = {
  readonly type: 'INSUFFICIENT_INVITE_PERMISSIONS';
  readonly requiredRole: string;
  readonly actualRole: string;
};

export const insufficientInvitePermissionsError = (
  requiredRole: string,
  actualRole: string
): InsufficientInvitePermissionsError => ({
  type: 'INSUFFICIENT_INVITE_PERMISSIONS',
  requiredRole,
  actualRole,
});

import type { OrganizationStorageError, MembershipStorageError } from './organization-errors.js';

export type InvitationServiceError =
  | InvitationNotFoundError
  | InvitationExpiredError
  | InvitationAlreadyAcceptedError
  | InvitationEmailMismatchError
  | AlreadyMemberOfOrgError
  | EmailAlreadyExistsError
  | InvitationOrgNotFoundError
  | InvitationUserNotFoundError
  | InsufficientInvitePermissionsError
  | InvitationStorageError
  | OrganizationStorageError
  | MembershipStorageError;
