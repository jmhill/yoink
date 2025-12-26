import { z } from 'zod';

/**
 * The types of authenticator transports supported by WebAuthn.
 */
export const PasskeyTransportSchema = z.enum(['usb', 'ble', 'nfc', 'internal', 'hybrid']);
export type PasskeyTransport = z.infer<typeof PasskeyTransportSchema>;

/**
 * Device type indicates whether the passkey is device-bound or synced.
 * - singleDevice: Hardware security key (never leaves device)
 * - multiDevice: Synced passkey (iCloud Keychain, Google Password Manager, etc.)
 */
export const PasskeyDeviceTypeSchema = z.enum(['singleDevice', 'multiDevice']);
export type PasskeyDeviceType = z.infer<typeof PasskeyDeviceTypeSchema>;

/**
 * A passkey credential stored after successful WebAuthn registration.
 */
export const PasskeyCredentialSchema = z.object({
  /** Base64URL credential ID from WebAuthn */
  id: z.string(),
  /** User this credential belongs to */
  userId: z.string().uuid(),
  /** Base64URL encoded COSE public key */
  publicKey: z.string(),
  /** Signature counter for replay protection */
  counter: z.number().int().nonnegative(),
  /** Authenticator transports (how the credential can be used) */
  transports: z.array(PasskeyTransportSchema).optional(),
  /** Device type: singleDevice (hardware key) or multiDevice (synced) */
  deviceType: PasskeyDeviceTypeSchema,
  /** Whether the credential is backed up (synced to cloud provider) */
  backedUp: z.boolean(),
  /** User-provided friendly name (e.g., "MacBook Pro", "iPhone 15") */
  name: z.string().optional(),
  /** When the credential was registered */
  createdAt: z.string().datetime(),
  /** When the credential was last used for authentication */
  lastUsedAt: z.string().datetime().optional(),
});

export type PasskeyCredential = z.infer<typeof PasskeyCredentialSchema>;
