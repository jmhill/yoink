import { z } from 'zod';

// ============================================================================
// Login Options (Step 1 - Get WebAuthn authentication options)
// ============================================================================

/**
 * Request for login options.
 * Empty body for discoverable credentials (user selects passkey on device).
 */
export const LoginOptionsRequestSchema = z.object({});

export type LoginOptionsRequest = z.infer<typeof LoginOptionsRequestSchema>;

/**
 * Response containing WebAuthn authentication options.
 */
export const LoginOptionsResponseSchema = z.object({
  /** WebAuthn authentication options (JSON encoded) */
  options: z.unknown(), // PublicKeyCredentialRequestOptionsJSON - complex nested type
  /** Signed challenge to pass back during verification */
  challenge: z.string(),
});

export type LoginOptionsResponse = z.infer<typeof LoginOptionsResponseSchema>;

// ============================================================================
// Login Verify (Step 2 - Verify passkey and create session)
// ============================================================================

/**
 * Request body for completing passkey login.
 */
export const LoginVerifyRequestSchema = z.object({
  /** The original challenge from login options */
  challenge: z.string(),
  /** WebAuthn authentication response from the browser */
  credential: z.unknown(), // AuthenticationResponseJSON - complex nested type
});

export type LoginVerifyRequest = z.infer<typeof LoginVerifyRequestSchema>;

/**
 * Response after successful passkey login.
 * A session is created and cookie set.
 */
export const LoginVerifyResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
  }),
});

export type LoginVerifyResponse = z.infer<typeof LoginVerifyResponseSchema>;

// ============================================================================
// Logout
// ============================================================================

/**
 * Response after successful logout.
 */
export const LogoutResponseSchema = z.object({
  success: z.literal(true),
});

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

// ============================================================================
// Session Info
// ============================================================================

/**
 * Organization membership info returned in session.
 */
export const SessionOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPersonal: z.boolean(),
  role: z.enum(['owner', 'admin', 'member']),
});

export type SessionOrganization = z.infer<typeof SessionOrganizationSchema>;

/**
 * Response containing current session information.
 */
export const SessionInfoResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
  }),
  organizationId: z.string(),
  organizations: z.array(SessionOrganizationSchema),
});

export type SessionInfoResponse = z.infer<typeof SessionInfoResponseSchema>;
