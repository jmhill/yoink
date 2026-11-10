import { err, ok, type Result } from 'neverthrow';
import {
  agentCannotUsePasskeyError,
  cannotDeleteLastPasskeyError,
  challengeExpiredError,
  credentialNotFoundError,
  credentialOwnershipError,
  verificationFailedError,
  type AgentCannotUsePasskeyError,
  type CannotDeleteLastPasskeyError,
  type ChallengeExpiredError,
  type CredentialNotFoundError,
  type CredentialOwnershipError,
  type VerificationFailedError,
} from './auth-errors.js';
import type { PasskeyCredential } from './passkey-credential.js';
import { planDeletePasskey, type DeletePasskeyPlan } from './passkey-plan.js';
import { isAgent, type User } from './user.js';
import { userNotFoundError, type UserNotFoundError } from './user-errors.js';
import type {
  AuthenticationVerification,
  RegistrationVerification,
  VerifiedPasskeyMaterial,
  WebAuthnCredentialDescriptor,
} from './webauthn-verifier.js';

export type ChallengeFailure = 'expired' | 'invalid' | null;

/**
 * The user query goes in first. A missing user is refused before
 * credentials are loaded. An agent is refused the same way.
 */
export const decideRegistrationSubject = (input: {
  readonly userId: string;
  readonly user: User | null;
}): Result<User, UserNotFoundError | AgentCannotUsePasskeyError> => {
  if (!input.user) {
    return err(userNotFoundError(input.userId));
  }
  if (isAgent(input.user)) {
    return err(agentCannotUsePasskeyError(input.userId));
  }
  return ok(input.user);
};

/**
 * Challenge expiry and a user mismatch are refused before the verifier
 * runs. Signup sets `skipUserIdCheck` because the challenge user id is
 * the email, not the new user id.
 */
export const decideRegistrationChallenge = (input: {
  readonly userId: string;
  readonly skipUserIdCheck: boolean;
  readonly failure: ChallengeFailure;
  readonly challengeUserId?: string;
}): Result<void, ChallengeExpiredError | VerificationFailedError> => {
  if (input.failure === 'expired') {
    return err(challengeExpiredError());
  }
  if (input.failure === 'invalid') {
    return err(verificationFailedError('Invalid challenge'));
  }
  if (!input.skipUserIdCheck && input.challengeUserId !== input.userId) {
    return err(verificationFailedError('Challenge user mismatch'));
  }
  return ok(undefined);
};

/** `verified: false` is the same refusal the service used to return. */
export const decideVerifiedRegistration = (
  verification: RegistrationVerification
): Result<VerifiedPasskeyMaterial, VerificationFailedError> => {
  if (!verification.verified) {
    return err(verificationFailedError('Registration verification failed'));
  }
  return ok({
    id: verification.id,
    publicKey: verification.publicKey,
    counter: verification.counter,
    transports: verification.transports,
    deviceType: verification.deviceType,
    backedUp: verification.backedUp,
  });
};

/** Authentication has no user-id check on the challenge. */
export const decideAuthenticationChallenge = (input: {
  readonly failure: ChallengeFailure;
}): Result<void, ChallengeExpiredError | VerificationFailedError> => {
  if (input.failure === 'expired') {
    return err(challengeExpiredError());
  }
  if (input.failure === 'invalid') {
    return err(verificationFailedError('Invalid challenge'));
  }
  return ok(undefined);
};

/**
 * A user id with no credentials is `USER_NOT_FOUND`, matching the
 * previous service. Discoverable authentication does not call this.
 */
export const decideAuthenticationCredentials = (input: {
  readonly userId: string;
  readonly credentials: readonly PasskeyCredential[];
}): Result<readonly WebAuthnCredentialDescriptor[], UserNotFoundError> => {
  if (input.credentials.length === 0) {
    return err(userNotFoundError(input.userId));
  }
  return ok(
    input.credentials.map((credential) => ({
      id: credential.id,
      transports: credential.transports,
    }))
  );
};

/** The credential query goes in after the challenge. A miss does not verify. */
export const decideAuthenticationCredential = (input: {
  readonly credentialId: string;
  readonly credential: PasskeyCredential | null;
}): Result<PasskeyCredential, CredentialNotFoundError> => {
  if (!input.credential) {
    return err(credentialNotFoundError(input.credentialId));
  }
  return ok(input.credential);
};

export const decideVerifiedAuthentication = (
  verification: AuthenticationVerification
): Result<{ readonly newCounter: number }, VerificationFailedError> => {
  if (!verification.verified) {
    return err(verificationFailedError('Authentication verification failed'));
  }
  return ok({ newCounter: verification.newCounter });
};

/**
 * Ownership is refused before the user's credential list is loaded.
 * A missing credential is not an ownership error.
 */
export const decideDeletePasskeyOwner = (input: {
  readonly credentialId: string;
  readonly userId: string;
  readonly credential: PasskeyCredential | null;
}): Result<void, CredentialNotFoundError | CredentialOwnershipError> => {
  if (!input.credential) {
    return err(credentialNotFoundError(input.credentialId));
  }
  if (input.credential.userId !== input.userId) {
    return err(credentialOwnershipError(input.credentialId, input.userId));
  }
  return ok(undefined);
};

/** The last passkey stays. Humans keep at least one. */
export const decideDeletePasskeyLast = (input: {
  readonly credentialId: string;
  readonly userId: string;
  readonly credentials: readonly PasskeyCredential[];
}): Result<DeletePasskeyPlan, CannotDeleteLastPasskeyError> => {
  if (input.credentials.length <= 1) {
    return err(cannotDeleteLastPasskeyError(input.userId));
  }
  return ok(planDeletePasskey(input.credentialId));
};
