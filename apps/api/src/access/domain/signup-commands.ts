import type {
  AcceptInvitationFailedError,
  AlreadyMemberOfOrgError,
  InvitationAlreadyAcceptedError,
  InvitationEmailMismatchError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationReplacedError,
  InvitationStorageError,
  WorkspaceAlreadyHasOwnerError,
} from './invitation-errors.js';
import type { Invitation, InvitationRole } from './invitation.js';
import type { Organization } from './organization.js';

export type SignupEmailAlreadyRegisteredError = {
  type: 'EMAIL_ALREADY_REGISTERED';
  email: string;
};

export type SignupOrganizationNotFoundError = {
  type: 'ORGANIZATION_NOT_FOUND';
  organizationId: string;
};

export type SignupStorageError = {
  type: 'SIGNUP_STORAGE_ERROR';
  message: string;
  cause?: unknown;
};

export type SignupServiceError =
  | InvitationNotFoundError
  | InvitationExpiredError
  | InvitationAlreadyAcceptedError
  | InvitationReplacedError
  | InvitationEmailMismatchError
  | WorkspaceAlreadyHasOwnerError
  | AlreadyMemberOfOrgError
  | SignupEmailAlreadyRegisteredError
  | SignupOrganizationNotFoundError
  | AcceptInvitationFailedError
  | SignupStorageError
  | InvitationStorageError;

export const emailAlreadyRegisteredError = (
  email: string
): SignupEmailAlreadyRegisteredError => ({
  type: 'EMAIL_ALREADY_REGISTERED',
  email,
});

export const organizationNotFoundError = (
  organizationId: string
): SignupOrganizationNotFoundError => ({
  type: 'ORGANIZATION_NOT_FOUND',
  organizationId,
});

export const signupStorageError = (
  message: string,
  cause?: unknown
): SignupStorageError => ({
  type: 'SIGNUP_STORAGE_ERROR',
  message,
  cause,
});

export type ValidateSignupRequestQuery = {
  code: string;
  email: string;
};

export type ValidateSignupResult = {
  invitation: Invitation;
  organization: Organization;
};

export type CompleteSignupCommand = {
  code: string;
  email: string;
};

export type CompleteSignupResult = {
  user: {
    id: string;
    email: string;
  };
  personalOrganization: {
    id: string;
    name: string;
  };
  invitedOrganization: {
    id: string;
    name: string;
    role: InvitationRole;
  };
};
