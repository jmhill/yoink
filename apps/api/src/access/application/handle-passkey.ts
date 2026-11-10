import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Clock } from '../../kernel/clock.js';
import type { CommitFailure, UnitOfWork } from '../../kernel/unit-of-work.js';
import {
  passkeyCredentialStorageError,
  type PasskeyCredentialStorageError,
  type PasskeyServiceError,
} from '../domain/auth-errors.js';
import type { ChallengeManager } from '../domain/challenge.js';
import {
  decideAuthenticationChallenge,
  decideAuthenticationCredential,
  decideAuthenticationCredentials,
  decideDeletePasskeyLast,
  decideDeletePasskeyOwner,
  decideRegistrationChallenge,
  decideRegistrationSubject,
  decideVerifiedAuthentication,
  decideVerifiedRegistration,
  type ChallengeFailure,
} from '../domain/decide-passkey.js';
import type {
  DeleteCredentialForUserParams,
  SignupRegistrationParams,
  VerifyAuthenticationParams,
  VerifyRegistrationParams,
} from '../domain/passkey-commands.js';
import type { PasskeyCredential } from '../domain/passkey-credential.js';
import type { PasskeyCredentialStore } from '../domain/passkey-credential-store.js';
import {
  planDeletePasskey,
  planRecordPasskeyUse,
  planSavePasskey,
  type PasskeyPlan,
} from '../domain/passkey-plan.js';
import type { UserService } from '../domain/user-service.js';
import type { WebAuthnVerifier } from '../domain/webauthn-verifier.js';

export type {
  DeleteCredentialForUserParams,
  SignupRegistrationParams,
  VerifyAuthenticationParams,
  VerifyRegistrationParams,
} from '../domain/passkey-commands.js';

export type RegistrationOptions = {
  readonly options: unknown;
  readonly challenge: string;
};

export type AuthenticationOptions = {
  readonly options: unknown;
  readonly challenge: string;
};

export type AuthenticationResult = {
  readonly userId: string;
  readonly credentialId: string;
};

export type PasskeyService = {
  /**
   * Generate registration options for a user to create a new passkey.
   * Returns the WebAuthn options and a challenge string to pass back during verification.
   */
  generateRegistrationOptions(
    userId: string
  ): ResultAsync<RegistrationOptions, PasskeyServiceError>;

  /**
   * Generate registration options for signup (user doesn't exist yet).
   * Uses email as the user identifier in WebAuthn options.
   */
  generateSignupRegistrationOptions(
    params: SignupRegistrationParams
  ): ResultAsync<RegistrationOptions, PasskeyServiceError>;

  /**
   * Verify a registration response and return the credential. Does not write.
   * Signup puts that credential in the same unit of work as the user.
   */
  planRegistrationCredential(
    params: VerifyRegistrationParams
  ): ResultAsync<PasskeyCredential, PasskeyServiceError>;

  /**
   * Verify a registration response and save the new credential.
   */
  verifyRegistration(
    params: VerifyRegistrationParams
  ): ResultAsync<PasskeyCredential, PasskeyServiceError>;

  /**
   * Generate authentication options for a user to authenticate with their passkey.
   * If userId is provided, only that user's credentials are allowed.
   * If userId is omitted, discoverable credentials are used (user selects on device).
   */
  generateAuthenticationOptions(
    userId?: string
  ): ResultAsync<AuthenticationOptions, PasskeyServiceError>;

  /**
   * Verify an authentication response.
   * Returns the userId and credentialId on success.
   */
  verifyAuthentication(
    params: VerifyAuthenticationParams
  ): ResultAsync<AuthenticationResult, PasskeyServiceError>;

  /**
   * List all passkey credentials for a user.
   */
  listCredentials(userId: string): ResultAsync<PasskeyCredential[], PasskeyServiceError>;

  /**
   * Delete a passkey credential (raw, no ownership check).
   * @deprecated Use deleteCredentialForUser for user-facing operations.
   */
  deleteCredential(credentialId: string): ResultAsync<void, PasskeyServiceError>;

  /**
   * Delete a passkey credential with ownership validation and last-passkey guard.
   * - Verifies the credential belongs to the specified user
   * - Prevents deletion if this is the user's only passkey
   * Humans must always have ≥1 passkey. Agents are token-only and cannot register passkeys.
   */
  deleteCredentialForUser(
    params: DeleteCredentialForUserParams
  ): ResultAsync<void, PasskeyServiceError>;
};

export type PasskeyServiceDependencies = {
  credentialStore: PasskeyCredentialStore;
  userService: UserService;
  clock: Clock;
  verifier: WebAuthnVerifier;
  challenges: ChallengeManager;
  /**
   * The composition root passes the sqlite unit of work. The plan then
   * commits through the access participant. Tests may omit it and apply
   * the same plan through the credential store. Signup does not use it:
   * `planRegistrationCredential` still only verifies.
   */
  unitOfWork?: UnitOfWork;
};

const storageMessage = (plan: PasskeyPlan): string => {
  switch (plan.kind) {
    case 'save-passkey':
      return 'Failed to save passkey credential';
    case 'record-passkey-use':
      return 'Failed to update passkey credential counter';
    case 'delete-passkey':
      return 'Failed to delete passkey credential';
    default: {
      const _never: never = plan;
      return _never;
    }
  }
};

const challengeFailure = (errorType: string | null): ChallengeFailure => {
  if (errorType === null) {
    return null;
  }
  return errorType === 'CHALLENGE_EXPIRED' ? 'expired' : 'invalid';
};

/**
 * Option generation and list stay reads. Registration verify, authentication
 * verify, and delete decide from the command and the queries they need,
 * then commit one passkey plan. `planRegistrationCredential` verifies and
 * does not write, so signup's batch stays as M5.12 left it.
 */
export const createPasskeyService = (deps: PasskeyServiceDependencies): PasskeyService => {
  const persist = (plan: PasskeyPlan): ResultAsync<void, PasskeyCredentialStorageError> => {
    if (deps.unitOfWork === undefined) {
      switch (plan.kind) {
        case 'save-passkey':
          return deps.credentialStore.save(plan.credential);
        case 'record-passkey-use':
          return deps.credentialStore
            .updateCounter(plan.credentialId, plan.counter)
            .andThen(() => deps.credentialStore.updateLastUsed(plan.credentialId, plan.lastUsedAt));
        case 'delete-passkey':
          return deps.credentialStore.delete(plan.credentialId);
        default: {
          const _never: never = plan;
          return _never;
        }
      }
    }
    return deps.unitOfWork
      .commit([
        {
          result: null,
          events: [],
          step: { owner: 'access', plan },
        },
      ])
      .map(() => undefined)
      .mapErr((failure: CommitFailure) => passkeyCredentialStorageError(storageMessage(plan), failure));
  };

  const registrationChallenge = (params: VerifyRegistrationParams) => {
    const challengeResult = deps.challenges.validateChallenge(params.challenge, 'registration');
    return decideRegistrationChallenge({
      userId: params.userId,
      skipUserIdCheck: params.skipUserIdCheck === true,
      failure: challengeFailure(challengeResult.isErr() ? challengeResult.error.type : null),
      ...(challengeResult.isOk() ? { challengeUserId: challengeResult.value.payload.userId } : {}),
    });
  };

  const planRegistrationCredential = (
    params: VerifyRegistrationParams
  ): ResultAsync<PasskeyCredential, PasskeyServiceError> => {
    const challengeDecision = registrationChallenge(params);
    if (challengeDecision.isErr()) {
      return errAsync(challengeDecision.error);
    }
    return deps.verifier
      .verifyRegistration({
        response: params.response,
        expectedChallenge: params.challenge,
      })
      .andThen((verification) => {
        const verified = decideVerifiedRegistration(verification);
        if (verified.isErr()) {
          return errAsync(verified.error);
        }
        const plan = planSavePasskey({
          userId: params.userId,
          ...(params.credentialName === undefined ? {} : { credentialName: params.credentialName }),
          now: deps.clock.now().toISOString(),
          material: verified.value,
        });
        return okAsync(plan.credential);
      });
  };

  return {
    generateRegistrationOptions(userId) {
      return deps.userService.getUser(userId).andThen((user) => {
        const subject = decideRegistrationSubject({ userId, user });
        if (subject.isErr()) {
          return errAsync(subject.error);
        }
        return deps.credentialStore.findByUserId(userId).andThen((existingCredentials) => {
          const challenge = deps.challenges.generateRegistrationChallenge(userId);
          return deps.verifier
            .registrationOptions({
              userName: subject.value.email,
              userDisplayName: subject.value.email,
              challenge,
              excludeCredentials: existingCredentials.map((existing) => ({
                id: existing.id,
                transports: existing.transports,
              })),
            })
            .map((options) => ({ options, challenge }));
        });
      });
    },

    generateSignupRegistrationOptions(params) {
      const challenge = deps.challenges.generateRegistrationChallenge(params.identifier);
      return deps.verifier
        .registrationOptions({
          userName: params.email,
          userDisplayName: params.email,
          challenge,
          excludeCredentials: [],
        })
        .map((options) => ({ options, challenge }));
    },

    planRegistrationCredential,

    verifyRegistration(params) {
      return planRegistrationCredential(params).andThen((credential) =>
        persist({ kind: 'save-passkey', credential }).map(() => credential)
      );
    },

    generateAuthenticationOptions(userId) {
      const challenge = deps.challenges.generateAuthenticationChallenge(userId);
      if (userId !== undefined) {
        return deps.credentialStore.findByUserId(userId).andThen((credentials) => {
          const allowed = decideAuthenticationCredentials({ userId, credentials });
          if (allowed.isErr()) {
            return errAsync(allowed.error);
          }
          return deps.verifier
            .authenticationOptions({
              challenge,
              allowCredentials: allowed.value,
            })
            .map((options) => ({ options, challenge }));
        });
      }
      return deps.verifier.authenticationOptions({ challenge }).map((options) => ({ options, challenge }));
    },

    verifyAuthentication(params) {
      const challengeResult = deps.challenges.validateChallenge(params.challenge, 'authentication');
      const challengeDecision = decideAuthenticationChallenge({
        failure: challengeFailure(challengeResult.isErr() ? challengeResult.error.type : null),
      });
      if (challengeDecision.isErr()) {
        return errAsync(challengeDecision.error);
      }
      const credentialId = params.response.id;
      return deps.credentialStore.findById(credentialId).andThen((loaded) => {
        const found = decideAuthenticationCredential({ credentialId, credential: loaded });
        if (found.isErr()) {
          return errAsync(found.error);
        }
        return deps.verifier
          .verifyAuthentication({
            response: params.response,
            expectedChallenge: params.challenge,
            credential: {
              id: found.value.id,
              publicKey: found.value.publicKey,
              counter: found.value.counter,
              transports: found.value.transports,
            },
          })
          .andThen((verification) => {
            const verified = decideVerifiedAuthentication(verification);
            if (verified.isErr()) {
              return errAsync(verified.error);
            }
            const plan = planRecordPasskeyUse({
              credentialId: found.value.id,
              newCounter: verified.value.newCounter,
              lastUsedAt: deps.clock.now().toISOString(),
            });
            return persist(plan).map(
              (): AuthenticationResult => ({
                userId: found.value.userId,
                credentialId: found.value.id,
              })
            );
          });
      });
    },

    listCredentials(userId) {
      return deps.credentialStore.findByUserId(userId);
    },

    deleteCredential(credentialId) {
      return persist(planDeletePasskey(credentialId));
    },

    deleteCredentialForUser(params) {
      return deps.credentialStore.findById(params.credentialId).andThen((loaded) => {
        const owner = decideDeletePasskeyOwner({
          credentialId: params.credentialId,
          userId: params.userId,
          credential: loaded,
        });
        if (owner.isErr()) {
          return errAsync(owner.error);
        }
        return deps.credentialStore.findByUserId(params.userId).andThen((credentials) => {
          const decision = decideDeletePasskeyLast({
            credentialId: params.credentialId,
            userId: params.userId,
            credentials,
          });
          if (decision.isErr()) {
            return errAsync(decision.error);
          }
          return persist(decision.value);
        });
      });
    },
  };
};
