import {
  INVITATION_REPLACED_MESSAGE,
  OWNER_INVITE_ADMIN_ONLY_MESSAGE,
  OWNER_INVITE_WRONG_EMAIL_MESSAGE,
  PERSONAL_WORKSPACE_OWNER_INVITE_MESSAGE,
  WORKSPACE_ALREADY_HAS_OWNER_MESSAGE,
} from '@yoink/api-contracts';
import type { OrganizationStorageError, MembershipStorageError } from './organization-errors.js';

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

/** This invite link isn't valid. */
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

/** This invite has expired. Ask for a new link. */
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

/** This invite has already been used. */
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
  readonly message: string;
};

export const invitationEmailMismatchError = (
  code: string,
  expectedEmail: string
): InvitationEmailMismatchError => ({
  type: 'INVITATION_EMAIL_MISMATCH',
  code,
  expectedEmail,
  message: OWNER_INVITE_WRONG_EMAIL_MESSAGE,
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

/** This invite was replaced. Ask for a new link. */
export type InvitationReplacedError = {
  readonly type: 'INVITATION_REPLACED';
  readonly code: string;
  readonly replacedAt: string;
  readonly message: string;
};

export const invitationReplacedError = (
  code: string,
  replacedAt: string
): InvitationReplacedError => ({
  type: 'INVITATION_REPLACED',
  code,
  replacedAt,
  message: INVITATION_REPLACED_MESSAGE,
});

export type WorkspaceAlreadyHasOwnerError = {
  readonly type: 'WORKSPACE_ALREADY_HAS_OWNER';
  readonly organizationId: string;
  readonly message: string;
};

export const workspaceAlreadyHasOwnerError = (
  organizationId: string
): WorkspaceAlreadyHasOwnerError => ({
  type: 'WORKSPACE_ALREADY_HAS_OWNER',
  organizationId,
  message: WORKSPACE_ALREADY_HAS_OWNER_MESSAGE,
});

export type PersonalWorkspaceOwnerInvitationError = {
  readonly type: 'PERSONAL_WORKSPACE_OWNER_INVITATION';
  readonly organizationId: string;
  readonly message: string;
};

export const personalWorkspaceOwnerInvitationError = (
  organizationId: string
): PersonalWorkspaceOwnerInvitationError => ({
  type: 'PERSONAL_WORKSPACE_OWNER_INVITATION',
  organizationId,
  message: PERSONAL_WORKSPACE_OWNER_INVITE_MESSAGE,
});

export type OwnerInvitationAdminOnlyError = {
  readonly type: 'OWNER_INVITATION_ADMIN_ONLY';
  readonly invitationId: string;
  readonly message: string;
};

export const ownerInvitationAdminOnlyError = (
  invitationId: string
): OwnerInvitationAdminOnlyError => ({
  type: 'OWNER_INVITATION_ADMIN_ONLY',
  invitationId,
  message: OWNER_INVITE_ADMIN_ONLY_MESSAGE,
});

export type CreateWorkspaceFailedError = {
  readonly type: 'CREATE_WORKSPACE_FAILED';
  readonly cause: unknown;
};

export const createWorkspaceFailedError = (
  cause: unknown
): CreateWorkspaceFailedError => ({
  type: 'CREATE_WORKSPACE_FAILED',
  cause,
});

export type ListWorkspacesFailed = {
  readonly type: 'LIST_WORKSPACES_FAILED';
  readonly cause: unknown;
};

export const listWorkspacesFailedError = (cause: unknown): ListWorkspacesFailed => ({
  type: 'LIST_WORKSPACES_FAILED',
  cause,
});

export type IssueOwnerInvitationFailedError = {
  readonly type: 'ISSUE_OWNER_INVITATION_FAILED';
  readonly cause: unknown;
};

export const issueOwnerInvitationFailedError = (
  cause: unknown
): IssueOwnerInvitationFailedError => ({
  type: 'ISSUE_OWNER_INVITATION_FAILED',
  cause,
});

export type AcceptInvitationFailedError = {
  readonly type: 'ACCEPT_INVITATION_FAILED';
  readonly cause: unknown;
};

export const acceptInvitationFailedError = (
  cause: unknown
): AcceptInvitationFailedError => ({
  type: 'ACCEPT_INVITATION_FAILED',
  cause,
});

export const ownerInviteEmailMismatchError = invitationEmailMismatchError;

export type InvitationServiceError =
  | InvitationNotFoundError
  | InvitationExpiredError
  | InvitationAlreadyAcceptedError
  | InvitationReplacedError
  | InvitationEmailMismatchError
  | AlreadyMemberOfOrgError
  | EmailAlreadyExistsError
  | InvitationOrgNotFoundError
  | InvitationUserNotFoundError
  | InsufficientInvitePermissionsError
  | OwnerInvitationAdminOnlyError
  | WorkspaceAlreadyHasOwnerError
  | PersonalWorkspaceOwnerInvitationError
  | CreateWorkspaceFailedError
  | IssueOwnerInvitationFailedError
  | AcceptInvitationFailedError
  | InvitationStorageError
  | OrganizationStorageError
  | MembershipStorageError;
