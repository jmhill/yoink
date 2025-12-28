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

export type PasskeyCredentialStorageError = {
  readonly type: 'PASSKEY_CREDENTIAL_STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type SessionStorageError = {
  readonly type: 'SESSION_STORAGE_ERROR';
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

export const passkeyCredentialStorageError = (
  message: string,
  cause?: unknown
): PasskeyCredentialStorageError => ({
  type: 'PASSKEY_CREDENTIAL_STORAGE_ERROR',
  message,
  cause,
});

export const sessionStorageError = (
  message: string,
  cause?: unknown
): SessionStorageError => ({
  type: 'SESSION_STORAGE_ERROR',
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

// ============================================================================
// Membership Service Errors
// ============================================================================

/** User already has a membership in the organization */
export type AlreadyMemberError = {
  readonly type: 'ALREADY_MEMBER';
  readonly userId: string;
  readonly organizationId: string;
};

/** Membership not found */
export type MembershipNotFoundError = {
  readonly type: 'MEMBERSHIP_NOT_FOUND';
  readonly membershipId?: string;
  readonly userId?: string;
  readonly organizationId?: string;
};

/** Cannot remove owner from personal organization */
export type CannotLeavePersonalOrgError = {
  readonly type: 'CANNOT_LEAVE_PERSONAL_ORG';
  readonly userId: string;
  readonly organizationId: string;
};

/** Cannot change owner role */
export type CannotChangeOwnerRoleError = {
  readonly type: 'CANNOT_CHANGE_OWNER_ROLE';
  readonly membershipId: string;
};

/** Organization must have at least one admin */
export type LastAdminError = {
  readonly type: 'LAST_ADMIN';
  readonly organizationId: string;
};

/** Insufficient permissions for the operation */
export type InsufficientPermissionsError = {
  readonly type: 'INSUFFICIENT_PERMISSIONS';
  readonly requiredRole: string;
  readonly actualRole: string;
};

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
  | UserStorageError
  | OrganizationStorageError;

export const alreadyMemberError = (
  userId: string,
  organizationId: string
): AlreadyMemberError => ({
  type: 'ALREADY_MEMBER',
  userId,
  organizationId,
});

export const membershipNotFoundError = (options: {
  membershipId?: string;
  userId?: string;
  organizationId?: string;
}): MembershipNotFoundError => ({
  type: 'MEMBERSHIP_NOT_FOUND',
  ...options,
});

export const cannotLeavePersonalOrgError = (
  userId: string,
  organizationId: string
): CannotLeavePersonalOrgError => ({
  type: 'CANNOT_LEAVE_PERSONAL_ORG',
  userId,
  organizationId,
});

export const cannotChangeOwnerRoleError = (
  membershipId: string
): CannotChangeOwnerRoleError => ({
  type: 'CANNOT_CHANGE_OWNER_ROLE',
  membershipId,
});

export const lastAdminError = (organizationId: string): LastAdminError => ({
  type: 'LAST_ADMIN',
  organizationId,
});

export const insufficientPermissionsError = (
  requiredRole: string,
  actualRole: string
): InsufficientPermissionsError => ({
  type: 'INSUFFICIENT_PERMISSIONS',
  requiredRole,
  actualRole,
});

// ============================================================================
// Passkey Service Errors
// ============================================================================

/** Credential not found during authentication */
export type CredentialNotFoundError = {
  readonly type: 'CREDENTIAL_NOT_FOUND';
  readonly credentialId: string;
};

/** Challenge has expired */
export type ChallengeExpiredError = {
  readonly type: 'CHALLENGE_EXPIRED';
};

/** Challenge signature does not match */
export type ChallengeMismatchError = {
  readonly type: 'CHALLENGE_MISMATCH';
};

/** WebAuthn verification failed */
export type VerificationFailedError = {
  readonly type: 'VERIFICATION_FAILED';
  readonly reason: string;
};

/** Signature counter indicates potential credential cloning */
export type CounterReplayError = {
  readonly type: 'COUNTER_REPLAY';
  readonly expected: number;
  readonly received: number;
};

/** Origin mismatch during verification */
export type OriginMismatchError = {
  readonly type: 'ORIGIN_MISMATCH';
  readonly expected: string | string[];
  readonly received: string;
};

/** RP ID mismatch during verification */
export type RpIdMismatchError = {
  readonly type: 'RP_ID_MISMATCH';
  readonly expected: string | string[];
  readonly received: string;
};

export type PasskeyServiceError =
  | UserNotFoundError
  | CredentialNotFoundError
  | ChallengeExpiredError
  | ChallengeMismatchError
  | VerificationFailedError
  | CounterReplayError
  | OriginMismatchError
  | RpIdMismatchError
  | PasskeyCredentialStorageError
  | UserStorageError;

export const credentialNotFoundError = (
  credentialId: string
): CredentialNotFoundError => ({
  type: 'CREDENTIAL_NOT_FOUND',
  credentialId,
});

export const challengeExpiredError = (): ChallengeExpiredError => ({
  type: 'CHALLENGE_EXPIRED',
});

export const challengeMismatchError = (): ChallengeMismatchError => ({
  type: 'CHALLENGE_MISMATCH',
});

export const verificationFailedError = (reason: string): VerificationFailedError => ({
  type: 'VERIFICATION_FAILED',
  reason,
});

export const counterReplayError = (
  expected: number,
  received: number
): CounterReplayError => ({
  type: 'COUNTER_REPLAY',
  expected,
  received,
});

export const originMismatchError = (
  expected: string | string[],
  received: string
): OriginMismatchError => ({
  type: 'ORIGIN_MISMATCH',
  expected,
  received,
});

export const rpIdMismatchError = (
  expected: string | string[],
  received: string
): RpIdMismatchError => ({
  type: 'RP_ID_MISMATCH',
  expected,
  received,
});

// ============================================================================
// Session Service Errors
// ============================================================================

/** User has no organization memberships */
export type NoMembershipsError = {
  readonly type: 'NO_MEMBERSHIPS';
  readonly userId: string;
};

/** User is not a member of the specified organization */
export type NotAMemberError = {
  readonly type: 'NOT_A_MEMBER';
  readonly userId: string;
  readonly organizationId: string;
};

/** Session not found */
export type SessionNotFoundError = {
  readonly type: 'SESSION_NOT_FOUND';
  readonly sessionId: string;
};

export type SessionServiceError =
  | UserNotFoundError
  | NoMembershipsError
  | NotAMemberError
  | SessionNotFoundError
  | SessionStorageError
  | UserStorageError
  | MembershipStorageError;

export const noMembershipsError = (userId: string): NoMembershipsError => ({
  type: 'NO_MEMBERSHIPS',
  userId,
});

export const notAMemberError = (
  userId: string,
  organizationId: string
): NotAMemberError => ({
  type: 'NOT_A_MEMBER',
  userId,
  organizationId,
});

export const sessionNotFoundError = (sessionId: string): SessionNotFoundError => ({
  type: 'SESSION_NOT_FOUND',
  sessionId,
});
