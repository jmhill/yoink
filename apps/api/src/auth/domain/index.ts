// Re-export from users domain
export { UserSchema, type User } from '../../users/domain/user.js';
export type { UserStore } from '../../users/domain/user-store.js';
export {
  createUserService,
  type UserService,
  type UserServiceDependencies,
} from '../../users/domain/user-service.js';

// Re-export from organizations domain
export { OrganizationSchema, type Organization } from '../../organizations/domain/organization.js';
export type { OrganizationStore } from '../../organizations/domain/organization-store.js';
export {
  OrganizationMembershipSchema,
  MembershipRoleSchema,
  type OrganizationMembership,
  type MembershipRole,
} from '../../organizations/domain/organization-membership.js';
export type { OrganizationMembershipStore } from '../../organizations/domain/organization-membership-store.js';
export {
  createMembershipService,
  type MembershipService,
  type MembershipServiceDependencies,
  type AddMemberCommand,
  type RemoveMemberCommand,
  type ChangeRoleCommand,
  type GetMembershipQuery,
  type ListMembershipsQuery,
} from '../../organizations/domain/membership-service.js';
export {
  createOrganizationService,
  type OrganizationService,
  type OrganizationServiceDependencies,
} from '../../organizations/domain/organization-service.js';

// Auth-specific domain types
export { ApiTokenSchema, type ApiToken } from './api-token.js';
export type { TokenStore } from './token-store.js';
export type { ValidateTokenQuery } from './token-queries.js';

export {
  PasskeyCredentialSchema,
  PasskeyTransportSchema,
  PasskeyDeviceTypeSchema,
  type PasskeyCredential,
  type PasskeyTransport,
  type PasskeyDeviceType,
} from './passkey-credential.js';
export type { PasskeyCredentialStore } from './passkey-credential-store.js';

export { UserSessionSchema, type UserSession } from './user-session.js';
export type { UserSessionStore } from './user-session-store.js';

// Auth services
export {
  createTokenService,
  type TokenService,
  type TokenServiceDependencies,
  type AuthResult,
} from './token-service.js';

export {
  createChallengeManager,
  type ChallengeManager,
  type ChallengeManagerDependencies,
  type ChallengePayload,
  type ValidatedChallenge,
  type ChallengeError,
} from './challenge.js';

export {
  createPasskeyService,
  type PasskeyService,
  type PasskeyServiceDependencies,
  type RegistrationOptions,
  type AuthenticationOptions,
  type VerifyRegistrationParams,
  type VerifyAuthenticationParams,
  type AuthenticationResult,
} from './passkey-service.js';

export {
  createSessionService,
  type SessionService,
  type SessionServiceDependencies,
  type CreateSessionCommand,
} from './session-service.js';

// Auth errors (auth-specific only)
export {
  tokenStorageError,
  passkeyCredentialStorageError,
  sessionStorageError,
  invalidTokenFormatError,
  tokenNotFoundError,
  invalidSecretError,
  credentialNotFoundError,
  challengeExpiredError,
  challengeMismatchError,
  verificationFailedError,
  counterReplayError,
  originMismatchError,
  rpIdMismatchError,
  noMembershipsError,
  notAMemberError,
  sessionNotFoundError,
  type TokenStorageError,
  type PasskeyCredentialStorageError,
  type SessionStorageError,
  type InvalidTokenFormatError,
  type TokenNotFoundError,
  type InvalidSecretError,
  type TokenValidationError,
  type CredentialNotFoundError,
  type ChallengeExpiredError,
  type ChallengeMismatchError,
  type VerificationFailedError,
  type CounterReplayError,
  type OriginMismatchError,
  type RpIdMismatchError,
  type PasskeyServiceError,
  type NoMembershipsError,
  type NotAMemberError,
  type SessionNotFoundError,
  type SessionServiceError,
} from './auth-errors.js';

// Re-export user/org errors for backward compatibility
export {
  userStorageError,
  userNotFoundError,
  type UserStorageError,
  type UserNotFoundError,
  type UserServiceError,
} from '../../users/domain/user-errors.js';

export {
  organizationStorageError,
  membershipStorageError,
  organizationNotFoundError,
  alreadyMemberError,
  membershipNotFoundError,
  cannotLeavePersonalOrgError,
  cannotChangeOwnerRoleError,
  lastAdminError,
  insufficientPermissionsError,
  type OrganizationStorageError,
  type MembershipStorageError,
  type OrganizationNotFoundError,
  type AlreadyMemberError,
  type MembershipNotFoundError,
  type CannotLeavePersonalOrgError,
  type CannotChangeOwnerRoleError,
  type LastAdminError,
  type InsufficientPermissionsError,
  type MembershipServiceError,
} from '../../organizations/domain/organization-errors.js';
