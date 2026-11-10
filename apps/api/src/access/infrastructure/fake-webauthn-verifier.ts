import { okAsync } from 'neverthrow';
import type {
  AuthenticationVerification,
  RegistrationVerification,
  WebAuthnCredentialDescriptor,
  WebAuthnVerifier,
} from '../domain/webauthn-verifier.js';

export type RegistrationOptionsCall = {
  readonly userName: string;
  readonly userDisplayName: string;
  readonly challenge: string;
  readonly excludeCredentials: readonly WebAuthnCredentialDescriptor[];
};

export type AuthenticationOptionsCall = {
  readonly challenge: string;
  readonly allowCredentials?: readonly WebAuthnCredentialDescriptor[];
};

export type FakeWebAuthnVerifier = WebAuthnVerifier & {
  readonly registrationOptionCalls: RegistrationOptionsCall[];
  readonly authenticationOptionCalls: AuthenticationOptionsCall[];
  setRegistrationOptions(options: unknown): void;
  setAuthenticationOptions(options: unknown): void;
  setRegistrationVerification(verification: RegistrationVerification): void;
  setAuthenticationVerification(verification: AuthenticationVerification): void;
};

/** Records ceremony calls and returns the fact the test set. */
export const createFakeWebAuthnVerifier = (): FakeWebAuthnVerifier => {
  const registrationOptionCalls: RegistrationOptionsCall[] = [];
  const authenticationOptionCalls: AuthenticationOptionsCall[] = [];
  let registrationOptions: unknown = {};
  let authenticationOptions: unknown = {};
  let registration: RegistrationVerification = { verified: false };
  let authentication: AuthenticationVerification = { verified: false };

  return {
    registrationOptionCalls,
    authenticationOptionCalls,
    setRegistrationOptions(options) {
      registrationOptions = options;
    },
    setAuthenticationOptions(options) {
      authenticationOptions = options;
    },
    setRegistrationVerification(verification) {
      registration = verification;
    },
    setAuthenticationVerification(verification) {
      authentication = verification;
    },
    registrationOptions(input) {
      registrationOptionCalls.push(input);
      return okAsync(registrationOptions);
    },
    authenticationOptions(input) {
      authenticationOptionCalls.push(input);
      return okAsync(authenticationOptions);
    },
    verifyRegistration() {
      return okAsync(registration);
    },
    verifyAuthentication() {
      return okAsync(authentication);
    },
  };
};
