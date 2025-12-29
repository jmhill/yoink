import type { UserStorageError, UserNotFoundError, UserServiceError } from '../../users/domain/user-errors.js';
import type { OrganizationStorageError, OrganizationNotFoundError, MembershipServiceError } from '../../organizations/domain/organization-errors.js';

// ============================================================================
// Storage Errors (auth-specific)
// ============================================================================

export type TokenStorageError = {
  readonly type: 'TOKEN_STORAGE_ERROR';
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

export const tokenStorageError = (
  message: string,
  cause?: unknown
): TokenStorageError => ({
  type: 'TOKEN_STORAGE_ERROR',
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

// ============================================================================
// Token Service Errors
// ============================================================================

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

export type TokenValidationError =
  | InvalidTokenFormatError
  | TokenNotFoundError
  | InvalidSecretError
  | UserNotFoundError
  | OrganizationNotFoundError
  | UserStorageError
  | OrganizationStorageError
  | TokenStorageError;

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

/** Cannot delete the user's last passkey */
export type CannotDeleteLastPasskeyError = {
  readonly type: 'CANNOT_DELETE_LAST_PASSKEY';
  readonly userId: string;
};

/** User does not own this credential */
export type CredentialOwnershipError = {
  readonly type: 'CREDENTIAL_OWNERSHIP_ERROR';
  readonly credentialId: string;
  readonly userId: string;
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
  | CannotDeleteLastPasskeyError
  | CredentialOwnershipError
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

export const cannotDeleteLastPasskeyError = (
  userId: string
): CannotDeleteLastPasskeyError => ({
  type: 'CANNOT_DELETE_LAST_PASSKEY',
  userId,
});

export const credentialOwnershipError = (
  credentialId: string,
  userId: string
): CredentialOwnershipError => ({
  type: 'CREDENTIAL_OWNERSHIP_ERROR',
  credentialId,
  userId,
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
  | UserServiceError
  | MembershipServiceError;

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
