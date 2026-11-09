import type { ResultAsync } from 'neverthrow';
import type { Actor, PrincipalKind } from '../../kernel/auth-context.js';
import type { InvitationRole } from '../domain/invitation.js';
import type { TokenValidationError } from '../domain/auth-errors.js';
import type { UserSession } from '../domain/user-session.js';
import type {
  SignupEmailAlreadyRegisteredError,
  SignupOrganizationNotFoundError,
  SignupServiceError,
  SignupStorageError,
} from '../domain/signup-service.js';

export type AccessStorageError = {
  readonly type: 'ACCESS_STORAGE';
  readonly message: string;
};

export type Unauthenticated = {
  readonly type: 'UNAUTHENTICATED';
};

/** Token auth's answer. The closed error says whether the token is bad or the check could not finish. */
export type AuthenticatedToken = {
  readonly organizationId: string;
  readonly userId: string;
  readonly principalKind: PrincipalKind;
  readonly actor: Actor;
};

export type AuthenticatedSession = {
  readonly organizationId: string;
  readonly userId: string;
  readonly principalKind: 'human';
  readonly actor: Actor;
  readonly session: UserSession;
};

export type UserDisplayName = {
  readonly id: string;
  readonly displayName: string;
};

export type PasskeyRegistrationFailed = {
  readonly type: 'PASSKEY_REGISTRATION_FAILED';
};

export type CompleteSignupError =
  | SignupServiceError
  | PasskeyRegistrationFailed;

export type CompletedSignup = {
  readonly user: {
    readonly id: string;
    readonly email: string;
  };
  readonly personalOrganization: {
    readonly id: string;
    readonly name: string;
  };
  readonly invitedOrganization: {
    readonly id: string;
    readonly name: string;
    readonly role: InvitationRole;
  };
  readonly sessionId: string;
};

export type AuthenticateToken = (
  plaintext: string
) => ResultAsync<AuthenticatedToken, TokenValidationError>;

export type AuthenticateSession = (
  sessionId: string
) => ResultAsync<AuthenticatedSession | null, AccessStorageError>;

export type RecordSessionActivity = (
  sessionId: string
) => ResultAsync<boolean, AccessStorageError>;

export type {
  SignupEmailAlreadyRegisteredError,
  SignupOrganizationNotFoundError,
  SignupStorageError,
};
