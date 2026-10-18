import type { ResultAsync } from 'neverthrow';
import type { User } from './user.js';
import type { Organization } from './organization.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Invitation } from './invitation.js';
import type { OwnerAssigned } from './membership-events.js';

export type SignupStorageError = {
  readonly type: 'SIGNUP_STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export const signupStorageError = (
  message: string,
  cause?: unknown
): SignupStorageError => ({
  type: 'SIGNUP_STORAGE_ERROR',
  message,
  cause,
});

export type CompleteSignupRecord = {
  user: User;
  personalOrganization: Organization;
  personalMembership: OrganizationMembership;
  invitedMembership: OrganizationMembership;
  accepted: Invitation;
  event: OwnerAssigned | null;
};

export type SignupStore = {
  completeSignup(
    record: CompleteSignupRecord
  ): ResultAsync<void, SignupStorageError>;
};
