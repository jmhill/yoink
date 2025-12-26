export { OrganizationSchema, type Organization } from './organization.js';
export { UserSchema, type User } from './user.js';
export { ApiTokenSchema, type ApiToken } from './api-token.js';
export {
  OrganizationMembershipSchema,
  MembershipRoleSchema,
  type OrganizationMembership,
  type MembershipRole,
} from './organization-membership.js';
export {
  PasskeyCredentialSchema,
  PasskeyTransportSchema,
  PasskeyDeviceTypeSchema,
  type PasskeyCredential,
  type PasskeyTransport,
  type PasskeyDeviceType,
} from './passkey-credential.js';
export type { OrganizationStore } from './organization-store.js';
export type { UserStore } from './user-store.js';
export type { TokenStore } from './token-store.js';
export type { OrganizationMembershipStore } from './organization-membership-store.js';
export type { PasskeyCredentialStore } from './passkey-credential-store.js';
export {
  createTokenService,
  type TokenService,
  type TokenServiceDependencies,
  type AuthResult,
} from './token-service.js';
export type { ValidateTokenQuery } from './token-queries.js';
export {
  userStorageError,
  tokenStorageError,
  organizationStorageError,
  membershipStorageError,
  passkeyCredentialStorageError,
  invalidTokenFormatError,
  tokenNotFoundError,
  invalidSecretError,
  userNotFoundError,
  organizationNotFoundError,
  alreadyMemberError,
  membershipNotFoundError,
  cannotLeavePersonalOrgError,
  cannotChangeOwnerRoleError,
  lastAdminError,
  insufficientPermissionsError,
  credentialNotFoundError,
  challengeExpiredError,
  challengeMismatchError,
  verificationFailedError,
  counterReplayError,
  originMismatchError,
  rpIdMismatchError,
  type UserStorageError,
  type TokenStorageError,
  type OrganizationStorageError,
  type MembershipStorageError,
  type PasskeyCredentialStorageError,
  type InvalidTokenFormatError,
  type TokenNotFoundError,
  type InvalidSecretError,
  type UserNotFoundError,
  type OrganizationNotFoundError,
  type TokenValidationError,
  type AlreadyMemberError,
  type MembershipNotFoundError,
  type CannotLeavePersonalOrgError,
  type CannotChangeOwnerRoleError,
  type LastAdminError,
  type InsufficientPermissionsError,
  type MembershipServiceError,
  type CredentialNotFoundError,
  type ChallengeExpiredError,
  type ChallengeMismatchError,
  type VerificationFailedError,
  type CounterReplayError,
  type OriginMismatchError,
  type RpIdMismatchError,
  type PasskeyServiceError,
} from './auth-errors.js';
export {
  createMembershipService,
  type MembershipService,
  type MembershipServiceDependencies,
  type AddMemberCommand,
  type RemoveMemberCommand,
  type ChangeRoleCommand,
  type GetMembershipQuery,
  type ListMembershipsQuery,
} from './membership-service.js';
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
