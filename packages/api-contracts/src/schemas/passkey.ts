import { z } from 'zod';

// ============================================================================
// Passkey Credential (API response format)
// ============================================================================

/**
 * Passkey credential info returned to clients.
 * Excludes sensitive data like publicKey.
 */
export const PasskeyCredentialInfoSchema = z.object({
  /** Base64URL credential ID */
  id: z.string(),
  /** User-provided friendly name (e.g., "MacBook Pro") */
  name: z.string().optional(),
  /** Device type: singleDevice (hardware key) or multiDevice (synced) */
  deviceType: z.enum(['singleDevice', 'multiDevice']),
  /** Whether the credential is backed up (synced to cloud provider) */
  backedUp: z.boolean(),
  /** When the credential was registered */
  createdAt: z.string().datetime(),
  /** When the credential was last used for authentication */
  lastUsedAt: z.string().datetime().optional(),
});

export type PasskeyCredentialInfo = z.infer<typeof PasskeyCredentialInfoSchema>;

// ============================================================================
// Registration Options (Step 1)
// ============================================================================

/**
 * Response containing WebAuthn registration options for existing users.
 * The challenge is signed and includes expiry information.
 */
export const PasskeyRegisterOptionsResponseSchema = z.object({
  /** WebAuthn registration options (JSON encoded) */
  options: z.unknown(), // PublicKeyCredentialCreationOptionsJSON - complex nested type
  /** Signed challenge to pass back during verification */
  challenge: z.string(),
});

export type PasskeyRegisterOptionsResponse = z.infer<typeof PasskeyRegisterOptionsResponseSchema>;

// ============================================================================
// Registration Verify (Step 2)
// ============================================================================

/**
 * Request body for completing passkey registration.
 */
export const PasskeyRegisterVerifyRequestSchema = z.object({
  /** The original challenge from registration options */
  challenge: z.string(),
  /** WebAuthn registration response from the browser */
  credential: z.unknown(), // RegistrationResponseJSON - complex nested type
  /** Optional name for the passkey credential */
  credentialName: z.string().optional(),
});

export type PasskeyRegisterVerifyRequest = z.infer<typeof PasskeyRegisterVerifyRequestSchema>;

/**
 * Response after successful passkey registration.
 * A session is created and cookie set.
 */
export const PasskeyRegisterVerifyResponseSchema = z.object({
  /** The newly registered credential info */
  credential: PasskeyCredentialInfoSchema,
});

export type PasskeyRegisterVerifyResponse = z.infer<typeof PasskeyRegisterVerifyResponseSchema>;

// ============================================================================
// List Credentials
// ============================================================================

/**
 * Response containing all passkey credentials for a user.
 */
export const PasskeyCredentialsListResponseSchema = z.object({
  credentials: z.array(PasskeyCredentialInfoSchema),
});

export type PasskeyCredentialsListResponse = z.infer<typeof PasskeyCredentialsListResponseSchema>;

// ============================================================================
// Delete Credential
// ============================================================================

/**
 * Response after successfully deleting a passkey credential.
 */
export const PasskeyDeleteResponseSchema = z.object({
  /** Confirmation message */
  message: z.string(),
});

export type PasskeyDeleteResponse = z.infer<typeof PasskeyDeleteResponseSchema>;
