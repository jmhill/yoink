import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { ResultAsync } from 'neverthrow';
import { verificationFailedError, type PasskeyServiceError } from '../domain/auth-errors.js';
import type { PasskeyTransport } from '../domain/passkey-credential.js';
import type {
  AuthenticationVerification,
  RegistrationVerification,
  WebAuthnVerifier,
} from '../domain/webauthn-verifier.js';

/**
 * Relying party fields the adapter needs. The challenge secret stays on
 * the challenge manager. The service does not import this config.
 */
export type SimpleWebAuthnRelyingParty = {
  readonly rpId: string;
  readonly rpName: string;
  readonly origin: string | readonly string[];
};

const normalizeOrigin = (origin: string | readonly string[]): string[] => {
  if (typeof origin === 'string') {
    return [origin];
  }
  return [...origin];
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
const challengeMatches = (expectedChallenge: string, receivedChallenge: string): boolean => {
  if (receivedChallenge === expectedChallenge) {
    return true;
  }

  try {
    const expectedBytes = Buffer.from(expectedChallenge, 'base64url');
    let receivedBytes = Buffer.from(receivedChallenge, 'base64url');
    if (receivedBytes.equals(expectedBytes)) {
      return true;
    }

    receivedBytes = Buffer.from(receivedChallenge, 'base64');
    if (receivedBytes.equals(expectedBytes)) {
      return true;
    }

    const decodedString = Buffer.from(receivedChallenge, 'base64').toString('utf-8');
    if (decodedString === expectedChallenge) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

const failed = (fallback: string) => (error: unknown): PasskeyServiceError =>
  verificationFailedError(error instanceof Error ? error.message : fallback);

const asTransports = (
  transports: readonly string[] | undefined
): readonly PasskeyTransport[] | undefined =>
  transports as readonly PasskeyTransport[] | undefined;

/**
 * The library call, the origin list, and the challenge encoding check.
 * A thrown error is `VERIFICATION_FAILED`. `verified: false` is returned
 * as a fact so the service can decide.
 */
export const createSimpleWebAuthnVerifier = (
  relyingParty: SimpleWebAuthnRelyingParty
): WebAuthnVerifier => {
  const expectedOrigin = normalizeOrigin(relyingParty.origin);

  return {
    registrationOptions(input) {
      return ResultAsync.fromPromise(
        generateRegistrationOptions({
          rpName: relyingParty.rpName,
          rpID: relyingParty.rpId,
          userName: input.userName,
          userDisplayName: input.userDisplayName,
          challenge: input.challenge,
          excludeCredentials: input.excludeCredentials.map((credential) => ({
            id: credential.id,
            ...(credential.transports === undefined
              ? {}
              : { transports: [...credential.transports] }),
          })),
          authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
          },
          attestationType: 'none',
        }),
        failed('Failed to generate options')
      );
    },

    authenticationOptions(input) {
      return ResultAsync.fromPromise(
        generateAuthenticationOptions({
          rpID: relyingParty.rpId,
          challenge: input.challenge,
          userVerification: 'preferred',
          ...(input.allowCredentials === undefined
            ? {}
            : {
                allowCredentials: input.allowCredentials.map((credential) => ({
                  id: credential.id,
                  ...(credential.transports === undefined
                    ? {}
                    : { transports: [...credential.transports] }),
                })),
              }),
        }),
        failed('Failed to generate options')
      );
    },

    verifyRegistration(input) {
      return ResultAsync.fromPromise(
        verifyRegistrationResponse({
          response: input.response as RegistrationResponseJSON,
          expectedChallenge: (received) => challengeMatches(input.expectedChallenge, received),
          expectedOrigin,
          expectedRPID: relyingParty.rpId,
          requireUserVerification: true,
        }),
        failed('Registration verification failed')
      ).map((verification): RegistrationVerification => {
        if (!verification.verified || !verification.registrationInfo) {
          return { verified: false };
        }
        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
        return {
          verified: true,
          id: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString('base64url'),
          counter: credential.counter,
          transports: asTransports(credential.transports),
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
        };
      });
    },

    verifyAuthentication(input) {
      return ResultAsync.fromPromise(
        verifyAuthenticationResponse({
          response: input.response as AuthenticationResponseJSON,
          expectedChallenge: (received) => challengeMatches(input.expectedChallenge, received),
          expectedOrigin,
          expectedRPID: relyingParty.rpId,
          credential: {
            id: input.credential.id,
            publicKey: Buffer.from(input.credential.publicKey, 'base64url'),
            counter: input.credential.counter,
            ...(input.credential.transports === undefined
              ? {}
              : { transports: [...input.credential.transports] }),
          },
          requireUserVerification: true,
        }),
        failed('Authentication verification failed')
      ).map((verification): AuthenticationVerification => {
        if (!verification.verified) {
          return { verified: false };
        }
        return {
          verified: true,
          newCounter: verification.authenticationInfo.newCounter,
        };
      });
    },
  };
};
