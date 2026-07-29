// Public API of the Administration & Access context (domain layer).
// Cross-context consumers import from this index only.
// Store interfaces, error factories, and ceremony internals are intentionally
// not exported — they are implementation details of this context.

// Identity & membership services
export { createUserService, type UserService } from './user-service.js';
export {
  createMembershipService,
  type MembershipService,
} from './membership-service.js';

// Organization & invitation services
export {
  createOrganizationService,
  type OrganizationService,
} from './organization-service.js';
export {
  createInvitationService,
  type InvitationService,
} from './invitation-service.js';

// Authentication services
export { createTokenService, type TokenService } from './token-service.js';
export {
  createUserTokenService,
  type UserTokenService,
} from './user-token-service.js';
export { createSessionService, type SessionService } from './session-service.js';
export { createPasskeyService, type PasskeyService } from './passkey-service.js';
export { createSignupService, type SignupService } from './signup-service.js';

// Super-admin services
export { createAdminService, type AdminService } from './admin-service.js';
export {
  createAdminSessionService,
  type AdminSessionService,
} from './admin-session-service.js';

// Domain types
export type { User } from './user.js';
export type { Organization } from './organization.js';
export type {
  OrganizationMembership,
  MembershipRole,
} from './organization-membership.js';
export type { Invitation, InvitationRole } from './invitation.js';
export type { ApiToken } from './api-token.js';
export type { PasskeyCredential } from './passkey-credential.js';
export type { UserSession } from './user-session.js';

// Error unions (per service)
export type { UserServiceError } from './user-errors.js';
export type {
  MembershipServiceError,
  OrganizationServiceError,
} from './organization-errors.js';
export type { InvitationServiceError } from './invitation-errors.js';
export type {
  TokenValidationError,
  PasskeyServiceError,
  SessionServiceError,
  UserTokenServiceError,
} from './auth-errors.js';
export type { SignupServiceError } from './signup-service.js';
export type { AdminServiceError } from './admin-errors.js';
