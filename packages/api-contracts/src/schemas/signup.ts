import { z } from 'zod';

/**
 * Request body for initiating signup with an invitation code.
 * Returns WebAuthn registration options.
 */
export const SignupOptionsRequestSchema = z.object({
  /** The invitation code */
  code: z.string().min(1),
  /** Email address for the new account (must match invitation email if restricted) */
  email: z.string().email(),
});

export type SignupOptionsRequest = z.infer<typeof SignupOptionsRequestSchema>;

/**
 * Response containing WebAuthn registration options.
 * The challenge is signed and includes expiry information.
 */
export const SignupOptionsResponseSchema = z.object({
  /** WebAuthn registration options (JSON encoded) */
  options: z.unknown(), // PublicKeyCredentialCreationOptionsJSON - complex nested type
  /** Signed challenge to pass back during verification */
  challenge: z.string(),
  /** Organization the user will be joining */
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  /** Role the user will have in the organization */
  role: z.enum(['admin', 'member']),
});

export type SignupOptionsResponse = z.infer<typeof SignupOptionsResponseSchema>;

/**
 * Request body for completing signup with WebAuthn response.
 */
export const SignupVerifyRequestSchema = z.object({
  /** The original challenge from signup options */
  challenge: z.string(),
  /** The invitation code (verified again for security) */
  code: z.string().min(1),
  /** Email address (must match invitation) */
  email: z.string().email(),
  /** WebAuthn registration response from the browser */
  credential: z.unknown(), // RegistrationResponseJSON - complex nested type
  /** Optional name for the passkey credential */
  credentialName: z.string().optional(),
});

export type SignupVerifyRequest = z.infer<typeof SignupVerifyRequestSchema>;

/**
 * Response after successful signup.
 * Includes the created user and session info.
 */
export const SignupVerifyResponseSchema = z.object({
  /** The newly created user */
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
  }),
  /** The personal organization created for the user */
  personalOrganization: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  /** The organization they were invited to join */
  invitedOrganization: z.object({
    id: z.string().uuid(),
    name: z.string(),
    role: z.enum(['admin', 'member']),
  }),
});

export type SignupVerifyResponse = z.infer<typeof SignupVerifyResponseSchema>;
