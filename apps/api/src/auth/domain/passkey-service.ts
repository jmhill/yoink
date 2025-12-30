import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { ResultAsync, errAsync } from 'neverthrow';
import type { Clock } from '@yoink/infrastructure';
import type { PasskeyCredential, PasskeyTransport } from './passkey-credential.js';
import type { PasskeyCredentialStore } from './passkey-credential-store.js';
import type { UserService } from '../../users/domain/user-service.js';
import type { WebAuthnConfig } from '../../config/schema.js';
import { createChallengeManager, type ChallengeManager } from './challenge.js';
import {
  credentialNotFoundError,
  challengeExpiredError,
  verificationFailedError,
  cannotDeleteLastPasskeyError,
  credentialOwnershipError,
  type PasskeyServiceError,
} from './auth-errors.js';
import { userNotFoundError } from '../../users/domain/user-errors.js';

// ============================================================================
// Types
// ============================================================================

export type PasskeyServiceDependencies = {
  credentialStore: PasskeyCredentialStore;
  userService: UserService;
  config: WebAuthnConfig;
  clock: Clock;
};

export type RegistrationOptions = {
  options: PublicKeyCredentialCreationOptionsJSON;
  challenge: string;
};

export type AuthenticationOptions = {
  options: PublicKeyCredentialRequestOptionsJSON;
  challenge: string;
};

export type VerifyRegistrationParams = {
  userId: string;
  challenge: string;
  response: RegistrationResponseJSON;
  credentialName?: string;
  /**
   * Skip userId validation in the challenge.
   * Used during signup where the challenge was created with email as identifier,
   * but verification happens after the user is created (with a real userId).
   */
  skipUserIdCheck?: boolean;
};

export type VerifyAuthenticationParams = {
  challenge: string;
  response: AuthenticationResponseJSON;
};

export type AuthenticationResult = {
  userId: string;
  credentialId: string;
};

export type SignupRegistrationParams = {
  /** Email for the new user (used as userName in WebAuthn) */
  email: string;
  /** A unique identifier to include in the challenge (e.g., invitation code or email) */
  identifier: string;
};

export type DeleteCredentialForUserParams = {
  credentialId: string;
  userId: string;
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
  listCredentials(
    userId: string
  ): ResultAsync<PasskeyCredential[], PasskeyServiceError>;

  /**
   * Delete a passkey credential (raw, no ownership check).
   * @deprecated Use deleteCredentialForUser for user-facing operations.
   */
  deleteCredential(
    credentialId: string
  ): ResultAsync<void, PasskeyServiceError>;

  /**
   * Delete a passkey credential with ownership validation and last-passkey guard.
   * - Verifies the credential belongs to the specified user
   * - Prevents deletion if this is the user's only passkey
   */
  deleteCredentialForUser(
    params: DeleteCredentialForUserParams
  ): ResultAsync<void, PasskeyServiceError>;
};

// ============================================================================
// Implementation
// ============================================================================

export const createPasskeyService = (
  deps: PasskeyServiceDependencies
): PasskeyService => {
  const { credentialStore, userService, config, clock } = deps;

  const challengeManager: ChallengeManager = createChallengeManager({
    secret: config.challengeSecret,
    clock,
  });

  const normalizeOrigin = (origin: string | string[]): string[] => {
    return Array.isArray(origin) ? origin : [origin];
  };

  /**
   * Creates a challenge verifier that handles encoding differences.
   * 
   * The issue: We pass challenge as a base64url string to generateRegistrationOptions.
   * The @simplewebauthn/browser library treats this as a base64url-encoded value and
   * decodes it to bytes, which it then passes to the browser's WebAuthn API.
   * 
   * The browser stores those bytes in clientDataJSON, base64url-encoded. But some
   * implementations (like CDP virtual authenticator) use standard base64.
   * 
   * Additionally, if the received challenge is in base64 format (not base64url),
   * and its decoded value equals our original base64url challenge STRING (not bytes),
   * then the browser double-encoded the challenge.
   */
  const createChallengeVerifier = (expectedChallenge: string) => {
    return (receivedChallenge: string): boolean => {
      // Direct match
      if (receivedChallenge === expectedChallenge) {
        return true;
      }
      
      try {
        // Case 1: The received challenge bytes should equal expected challenge bytes
        // This is the standard WebAuthn case
        const expectedBytes = Buffer.from(expectedChallenge, 'base64url');
        let receivedBytes = Buffer.from(receivedChallenge, 'base64url');
        if (receivedBytes.equals(expectedBytes)) {
          return true;
        }
        
        // Try with standard base64 decoding
        receivedBytes = Buffer.from(receivedChallenge, 'base64');
        if (receivedBytes.equals(expectedBytes)) {
          return true;
        }
        
        // Case 2: The received challenge is the expected challenge STRING encoded as base64
        // This happens with some virtual authenticator implementations
        const decodedString = Buffer.from(receivedChallenge, 'base64').toString('utf-8');
        if (decodedString === expectedChallenge) {
          return true;
        }
        
        return false;
      } catch {
        return false;
      }
    };
  };

  return {
    generateRegistrationOptions: (
      userId: string
    ): ResultAsync<RegistrationOptions, PasskeyServiceError> => {
      return userService.getUser(userId).andThen((user) => {
        if (!user) {
          return errAsync(userNotFoundError(userId));
        }

        return credentialStore.findByUserId(userId).andThen((existingCredentials) => {
          const challenge = challengeManager.generateRegistrationChallenge(userId);

          // Build excludeCredentials to prevent re-registering same authenticator
          const excludeCredentials = existingCredentials.map((cred) => ({
            id: cred.id,
            transports: cred.transports,
          }));

          // Wrap the async call in ResultAsync.fromPromise
          return ResultAsync.fromPromise(
            generateRegistrationOptions({
              rpName: config.rpName,
              rpID: config.rpId,
              userName: user.email,
              userDisplayName: user.email,
              challenge,
              excludeCredentials,
              authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
              },
              attestationType: 'none', // We don't need attestation for our use case
            }),
            (error): PasskeyServiceError =>
              verificationFailedError(
                error instanceof Error ? error.message : 'Failed to generate options'
              )
          ).map((options) => ({
            options,
            challenge,
          }));
        });
      });
    },

    generateSignupRegistrationOptions: (
      params: SignupRegistrationParams
    ): ResultAsync<RegistrationOptions, PasskeyServiceError> => {
      const { email, identifier } = params;

      // Generate a challenge for signup (uses identifier instead of userId)
      const challenge = challengeManager.generateRegistrationChallenge(identifier);

      // No exclude credentials for signup (new user has no existing credentials)
      return ResultAsync.fromPromise(
        generateRegistrationOptions({
          rpName: config.rpName,
          rpID: config.rpId,
          userName: email,
          userDisplayName: email,
          challenge,
          excludeCredentials: [],
          authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
          },
          attestationType: 'none',
        }),
        (error): PasskeyServiceError =>
          verificationFailedError(
            error instanceof Error ? error.message : 'Failed to generate options'
          )
      ).map((options) => ({
        options,
        challenge,
      }));
    },

    verifyRegistration: (
      params: VerifyRegistrationParams
    ): ResultAsync<PasskeyCredential, PasskeyServiceError> => {
      const { userId, challenge, response, credentialName, skipUserIdCheck } = params;

      // Validate challenge
      const challengeResult = challengeManager.validateChallenge(challenge, 'registration');
      if (challengeResult.isErr()) {
        const error = challengeResult.error;
        if (error.type === 'CHALLENGE_EXPIRED') {
          return errAsync(challengeExpiredError());
        }
        return errAsync(verificationFailedError('Invalid challenge'));
      }

      const validatedChallenge = challengeResult.value;
      // Skip userId check during signup (challenge was created with email, not userId)
      if (!skipUserIdCheck && validatedChallenge.payload.userId !== userId) {
        return errAsync(verificationFailedError('Challenge user mismatch'));
      }

      const expectedOrigins = normalizeOrigin(config.origin);

      return ResultAsync.fromPromise(
        verifyRegistrationResponse({
          response,
          expectedChallenge: createChallengeVerifier(challenge),
          expectedOrigin: expectedOrigins,
          expectedRPID: config.rpId,
          requireUserVerification: true,
        }),
        (error): PasskeyServiceError => {
          return verificationFailedError(
            error instanceof Error ? error.message : 'Registration verification failed'
          );
        }
      ).andThen((verification) => {
        if (!verification.verified || !verification.registrationInfo) {
          return errAsync(verificationFailedError('Registration verification failed'));
        }

        const { registrationInfo } = verification;
        const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

        // Create domain credential
        const passkeyCredential: PasskeyCredential = {
          id: credential.id,
          userId,
          publicKey: Buffer.from(credential.publicKey).toString('base64url'),
          counter: credential.counter,
          transports: credential.transports as PasskeyTransport[] | undefined,
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          name: credentialName,
          createdAt: clock.now().toISOString(),
          lastUsedAt: undefined,
        };

        return credentialStore.save(passkeyCredential).map(() => passkeyCredential);
      });
    },

    generateAuthenticationOptions: (
      userId?: string
    ): ResultAsync<AuthenticationOptions, PasskeyServiceError> => {
      const challenge = challengeManager.generateAuthenticationChallenge(userId);

      if (userId) {
        // User-specific authentication
        return credentialStore.findByUserId(userId).andThen((credentials) => {
          if (credentials.length === 0) {
            return errAsync(userNotFoundError(userId));
          }

          const allowCredentials = credentials.map((cred) => ({
            id: cred.id,
            transports: cred.transports,
          }));

          return ResultAsync.fromPromise(
            generateAuthenticationOptions({
              rpID: config.rpId,
              allowCredentials,
              challenge,
              userVerification: 'preferred',
            }),
            (error): PasskeyServiceError =>
              verificationFailedError(
                error instanceof Error ? error.message : 'Failed to generate options'
              )
          ).map((options) => ({
            options,
            challenge,
          }));
        });
      }

      // Discoverable credential authentication (no allowCredentials)
      return ResultAsync.fromPromise(
        generateAuthenticationOptions({
          rpID: config.rpId,
          challenge,
          userVerification: 'preferred',
        }),
        (error): PasskeyServiceError =>
          verificationFailedError(
            error instanceof Error ? error.message : 'Failed to generate options'
          )
      ).map((options) => ({
        options,
        challenge,
      }));
    },

    verifyAuthentication: (
      params: VerifyAuthenticationParams
    ): ResultAsync<AuthenticationResult, PasskeyServiceError> => {
      const { challenge, response } = params;

      // Validate challenge
      const challengeResult = challengeManager.validateChallenge(challenge, 'authentication');
      if (challengeResult.isErr()) {
        const error = challengeResult.error;
        if (error.type === 'CHALLENGE_EXPIRED') {
          return errAsync(challengeExpiredError());
        }
        return errAsync(verificationFailedError('Invalid challenge'));
      }

      // Get the credential from the response
      const credentialId = response.id;

      return credentialStore.findById(credentialId).andThen((credential) => {
        if (!credential) {
          return errAsync(credentialNotFoundError(credentialId));
        }

        // Build the credential object expected by verifyAuthenticationResponse
        const webauthnCredential = {
          id: credential.id,
          publicKey: Buffer.from(credential.publicKey, 'base64url'),
          counter: credential.counter,
          transports: credential.transports,
        };

        return ResultAsync.fromPromise(
          verifyAuthenticationResponse({
            response,
            expectedChallenge: createChallengeVerifier(challenge),
            expectedOrigin: normalizeOrigin(config.origin),
            expectedRPID: config.rpId,
            credential: webauthnCredential,
            requireUserVerification: true,
          }),
          (error): PasskeyServiceError =>
            verificationFailedError(
              error instanceof Error ? error.message : 'Authentication verification failed'
            )
        ).andThen((verification) => {
          if (!verification.verified) {
            return errAsync(verificationFailedError('Authentication verification failed'));
          }

          const { newCounter } = verification.authenticationInfo;

          // Update counter and last used timestamp
          return credentialStore
            .updateCounter(credentialId, newCounter)
            .andThen(() =>
              credentialStore.updateLastUsed(credentialId, clock.now().toISOString())
            )
            .map((): AuthenticationResult => ({
              userId: credential.userId,
              credentialId: credential.id,
            }));
        });
      });
    },

    listCredentials: (
      userId: string
    ): ResultAsync<PasskeyCredential[], PasskeyServiceError> => {
      return credentialStore.findByUserId(userId);
    },

    deleteCredential: (
      credentialId: string
    ): ResultAsync<void, PasskeyServiceError> => {
      return credentialStore.delete(credentialId);
    },

    deleteCredentialForUser: (
      params: DeleteCredentialForUserParams
    ): ResultAsync<void, PasskeyServiceError> => {
      const { credentialId, userId } = params;

      // First check if credential exists and belongs to user
      return credentialStore.findById(credentialId).andThen((credential) => {
        if (!credential) {
          return errAsync(credentialNotFoundError(credentialId));
        }

        if (credential.userId !== userId) {
          return errAsync(credentialOwnershipError(credentialId, userId));
        }

        // Check if this is the user's last passkey
        return credentialStore.findByUserId(userId).andThen((credentials) => {
          if (credentials.length <= 1) {
            return errAsync(cannotDeleteLastPasskeyError(userId));
          }

          // Safe to delete
          return credentialStore.delete(credentialId);
        });
      });
    },
  };
};
