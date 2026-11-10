import type { ResultAsync } from 'neverthrow';
import type { PasskeyServiceError } from './auth-errors.js';
import type { PasskeyDeviceType, PasskeyTransport } from './passkey-credential.js';

/**
 * A credential the ceremony may use. The adapter adds relying-party
 * config. This port does not see the challenge secret.
 */
export type WebAuthnCredentialDescriptor = {
  readonly id: string;
  readonly transports?: readonly PasskeyTransport[];
};

/** Fields taken from a verified registration. The plan copies them. */
export type VerifiedPasskeyMaterial = {
  readonly id: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports?: readonly PasskeyTransport[];
  readonly deviceType: PasskeyDeviceType;
  readonly backedUp: boolean;
};

export type RegistrationVerification =
  | { readonly verified: false }
  | ({ readonly verified: true } & VerifiedPasskeyMaterial);

export type AuthenticationVerification =
  | { readonly verified: false }
  | { readonly verified: true; readonly newCounter: number };

/**
 * `@simplewebauthn/server` stays behind this port. The service decides
 * from the fact the port returns. A thrown library error is already a
 * `VERIFICATION_FAILED`. `verified: false` is a fact, not an error.
 */
export type WebAuthnVerifier = {
  registrationOptions(input: {
    readonly userName: string;
    readonly userDisplayName: string;
    readonly challenge: string;
    readonly excludeCredentials: readonly WebAuthnCredentialDescriptor[];
  }): ResultAsync<unknown, PasskeyServiceError>;

  authenticationOptions(input: {
    readonly challenge: string;
    readonly allowCredentials?: readonly WebAuthnCredentialDescriptor[];
  }): ResultAsync<unknown, PasskeyServiceError>;

  verifyRegistration(input: {
    readonly response: unknown;
    readonly expectedChallenge: string;
  }): ResultAsync<RegistrationVerification, PasskeyServiceError>;

  verifyAuthentication(input: {
    readonly response: unknown;
    readonly expectedChallenge: string;
    readonly credential: {
      readonly id: string;
      readonly publicKey: string;
      readonly counter: number;
      readonly transports?: readonly PasskeyTransport[];
    };
  }): ResultAsync<AuthenticationVerification, PasskeyServiceError>;
};
