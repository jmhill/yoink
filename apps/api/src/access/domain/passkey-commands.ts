/**
 * What the caller asked. The browser registration payload is opaque: the
 * verifier port is the only reader. Authentication reads `id` so the
 * credential query can run before that verify.
 */

export type WebAuthnAuthenticationResponse = {
  readonly id: string;
};

export type VerifyRegistrationParams = {
  userId: string;
  challenge: string;
  response: unknown;
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
  response: WebAuthnAuthenticationResponse;
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
