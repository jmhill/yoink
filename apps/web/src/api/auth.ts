import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialCreationOptionsJSON,
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import {
  EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE,
  ErrorSchema,
  INVITATION_EXPIRED_MESSAGE,
  INVITATION_NOT_FOUND_MESSAGE,
  memberDisplayName,
  REMOVE_NOT_ALLOWED_MESSAGE,
  removeMemberFailedMessage,
  type SignupOptionsResponse,
  type SignupVerifyResponse,
} from '@yoink/api-contracts';
import { httpFailureBody, httpFailureMessage, httpStatusOf, settingsClient } from '@/api/client';

const messageFromErrorBody = (body: unknown, fallback: string): string => {
  const parsed = ErrorSchema.safeParse(body);
  if (parsed.success && parsed.data.message.length > 0) {
    return parsed.data.message;
  }
  return fallback;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; handoverPath?: string };

export type SessionOrganization = {
  id: string;
  name: string;
  isPersonal: boolean;
  role: 'owner' | 'admin' | 'member';
};

export type SessionInfo = {
  user: { id: string; email: string };
  organizationId: string;
  organizations: SessionOrganization[];
};

/**
 * Get session info for the current user.
 * Used to check if user is authenticated.
 */
export const getSession = async (): Promise<ApiResponse<SessionInfo>> => {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.message || 'Not authenticated' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Get login options from server (for passkey authentication).
 */
const getLoginOptions = async (): Promise<
  ApiResponse<{ options: PublicKeyCredentialRequestOptionsJSON; challenge: string }>
> => {
  const response = await fetch('/api/auth/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.message || 'Failed to get login options' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Verify login with passkey authentication response.
 */
const verifyLogin = async (options: {
  challenge: string;
  credential: AuthenticationResponseJSON;
}): Promise<ApiResponse<{ user: { id: string; email: string } }>> => {
  const response = await fetch('/api/auth/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.message || 'Login failed' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Full passkey login flow:
 * 1. Get login options from server
 * 2. Prompt user for passkey authentication via browser
 * 3. Send response to server for verification
 */
export const loginWithPasskey = async (): Promise<
  ApiResponse<{ user: { id: string; email: string } }>
> => {
  // Step 1: Get login options
  const optionsResult = await getLoginOptions();
  if (!optionsResult.ok) {
    return optionsResult;
  }

  // Step 2: Start WebAuthn authentication (browser prompt)
  let credential: AuthenticationResponseJSON;
  try {
    credential = await startAuthentication({
      optionsJSON: optionsResult.data.options,
    });
  } catch (err) {
    // User cancelled or device doesn't support WebAuthn
    const message = err instanceof Error ? err.message : 'Authentication failed';
    return { ok: false, error: message };
  }

  // Step 3: Verify with server
  return verifyLogin({
    challenge: optionsResult.data.challenge,
    credential,
  });
};

/**
 * Switch the current organization for the session.
 * Join still uses this alias path. Settings and the header switcher use
 * `switchWebOrganization`.
 */
export const switchOrganization = async (
  organizationId: string
): Promise<ApiResponse<{ success: true }>> => {
  const response = await fetch('/api/organizations/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ organizationId }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.message || 'Failed to switch organization' };
  }

  return { ok: true, data: { success: true } };
};

/** Header and settings organization switch. */
export const switchWebOrganization = async (
  organizationId: string
): Promise<ApiResponse<{ success: true }>> => {
  try {
    await settingsClient.switchOrganization({ organizationId });
    return { ok: true, data: { success: true } };
  } catch (error) {
    return { ok: false, error: httpFailureMessage(error) || 'Failed to switch organization' };
  }
};

/**
 * Leave an organization.
 * Returns specific error messages for personal org and last admin cases.
 */
const handoverPathOf = (error: unknown): string | undefined => {
  const body = httpFailureBody(error);
  if (
    typeof body === 'object' &&
    body !== null &&
    'handoverPath' in body &&
    typeof body.handoverPath === 'string'
  ) {
    return body.handoverPath;
  }
  return undefined;
};

export const leaveOrganization = async (
  organizationId: string
): Promise<ApiResponse<{ success: true }>> => {
  try {
    await settingsClient.leave({ organizationId });
    return { ok: true, data: { success: true } };
  } catch (error) {
    const status = httpStatusOf(error);
    const message = httpFailureMessage(error);
    if (status === 404) {
      return { ok: false, error: 'Not a member of this organization' };
    }
    if (status === 400) {
      return { ok: false, error: message ?? 'Cannot leave this organization' };
    }
    return {
      ok: false,
      error: message ?? 'Failed to leave organization',
      handoverPath: handoverPathOf(error),
    };
  }
};

/**
 * Logout - revoke session and clear cookie.
 */
export const logout = async (): Promise<ApiResponse<{ success: true }>> => {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.message || 'Logout failed' };
  }

  return { ok: true, data: { success: true } };
};

/**
 * Validate an invitation code.
 */
export const validateInvitation = async (
  code: string,
  email?: string
): Promise<
  ApiResponse<{
    id: string;
    organizationId: string;
    organizationName: string;
    email: string | null;
    role: 'owner' | 'admin' | 'member';
    expiresAt: string;
  }>
> => {
  const response = await fetch('/api/invitations/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(email === undefined ? { code } : { code, email }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return {
      ok: false,
      error: messageFromErrorBody(
        body,
        response.status === 404
          ? INVITATION_NOT_FOUND_MESSAGE
          : response.status === 410
            ? INVITATION_EXPIRED_MESSAGE
            : 'Invalid invitation'
      ),
    };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Accept an invitation (for existing authenticated users).
 * This adds the user to the organization and returns the accepted invitation info.
 */
export const acceptInvitation = async (
  code: string
): Promise<
  ApiResponse<{
    id: string;
    organizationId: string;
    organizationName: string;
    role: 'owner' | 'admin' | 'member';
  }>
> => {
  const response = await fetch('/api/invitations/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      return { ok: false, error: 'Not authenticated' };
    }
    return {
      ok: false,
      error: messageFromErrorBody(body, 'Failed to accept invitation'),
    };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Get signup options from server (for passkey registration during signup).
 */
const getSignupOptions = async (options: {
  code: string;
  email: string;
}): Promise<ApiResponse<SignupOptionsResponse>> => {
  const response = await fetch('/api/auth/signup/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return {
      ok: false,
      error: messageFromErrorBody(
        body,
        response.status === 409
          ? EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE
          : response.status === 404
            ? INVITATION_NOT_FOUND_MESSAGE
            : 'Failed to get signup options'
      ),
    };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Verify signup with passkey registration response.
 */
const verifySignup = async (options: {
  challenge: string;
  code: string;
  email: string;
  credential: RegistrationResponseJSON;
  credentialName?: string;
}): Promise<ApiResponse<SignupVerifyResponse>> => {
  const response = await fetch('/api/auth/signup/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return {
      ok: false,
      error: messageFromErrorBody(
        body,
        response.status === 409 ? EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE : 'Signup failed'
      ),
    };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Full signup flow:
 * 1. Get signup options from server (validates invitation)
 * 2. Prompt user for passkey registration via browser
 * 3. Send response to server to complete signup
 */
export const signupWithPasskey = async (options: {
  code: string;
  email: string;
  deviceName?: string;
}): Promise<ApiResponse<SignupVerifyResponse>> => {
  const { code, email, deviceName } = options;

  // Step 1: Get signup options
  const optionsResult = await getSignupOptions({ code, email });
  if (!optionsResult.ok) {
    return optionsResult;
  }

  // Step 2: Start WebAuthn registration (browser prompt)
  let credential: RegistrationResponseJSON;
  try {
    credential = await startRegistration({
      optionsJSON: optionsResult.data.options as PublicKeyCredentialCreationOptionsJSON,
    });
  } catch (err) {
    // User cancelled or device doesn't support WebAuthn
    const message = err instanceof Error ? err.message : 'Registration failed';
    return { ok: false, error: message };
  }

  // Step 3: Verify with server
  return verifySignup({
    challenge: optionsResult.data.challenge,
    code,
    email,
    credential,
    credentialName: deviceName,
  });
};

// ============================================================================
// Member Management
// ============================================================================

export type Member = {
  userId: string;
  email: string;
  name?: string;
  kind: 'human' | 'agent';
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
};

export type MintedAgent = {
  agent: {
    userId: string;
    name: string;
    kind: 'agent';
    role: 'owner' | 'admin' | 'member';
  };
  token: { id: string; name: string; createdAt: string };
  rawToken: string;
};

export { memberDisplayName };

export const memberLabel = (member: Pick<Member, 'email' | 'name' | 'kind'>): string =>
  member.kind === 'agent' ? (member.name ?? 'Agent') : member.email;

/**
 * List members of the current organization.
 */
export const listMembers = async (
  organizationId: string
): Promise<ApiResponse<{ members: Member[] }>> => {
  try {
    const data = await settingsClient.listMembers({ organizationId });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: httpFailureMessage(error) || 'Failed to list members' };
  }
};

/**
 * Mint a token-only agent member. Returns the API token once.
 */
export const mintAgent = async (
  organizationId: string,
  name: string
): Promise<ApiResponse<MintedAgent>> => {
  try {
    const data = await settingsClient.createAgent({ organizationId, name });
    return { ok: true, data };
  } catch (error) {
    const message = httpFailureMessage(error);
    if (httpStatusOf(error) === 403) {
      return { ok: false, error: message || 'Only owners and admins can mint agents' };
    }
    return { ok: false, error: message || 'Failed to mint agent' };
  }
};

/**
 * Remove a member from the current organization.
 */
export const removeMember = async (
  organizationId: string,
  userId: string
): Promise<ApiResponse<void>> => {
  try {
    await settingsClient.removeMember({ organizationId, userId });
    return { ok: true, data: undefined };
  } catch (error) {
    const message = httpFailureMessage(error);
    const status = httpStatusOf(error);
    if (status === 403) {
      return { ok: false, error: message || REMOVE_NOT_ALLOWED_MESSAGE };
    }
    if (status === 400) {
      return { ok: false, error: message || 'Cannot remove this member' };
    }
    return { ok: false, error: message || removeMemberFailedMessage('member') };
  }
};

// ============================================================================
// Invitation Management
// ============================================================================

export type Invitation = {
  id: string;
  code: string;
  email: string | null;
  organizationId: string;
  role: 'owner' | 'admin' | 'member';
  expiresAt: string;
  createdAt: string;
};

/**
 * Create an invitation to the current organization.
 */
export const createInvitation = async (
  organizationId: string,
  options: { role?: 'admin' | 'member'; email?: string }
): Promise<ApiResponse<Invitation>> => {
  try {
    const data = await settingsClient.createInvitation({
      organizationId,
      role: options.role ?? 'member',
      email: options.email,
    });
    return { ok: true, data };
  } catch (error) {
    if (httpStatusOf(error) === 403) {
      return { ok: false, error: 'You do not have permission to create invitations' };
    }
    return { ok: false, error: httpFailureMessage(error) || 'Failed to create invitation' };
  }
};

/**
 * List pending invitations for the current organization.
 */
export const listPendingInvitations = async (
  organizationId: string
): Promise<ApiResponse<{ invitations: Invitation[] }>> => {
  try {
    const data = await settingsClient.listPendingInvitations({ organizationId });
    return { ok: true, data: { invitations: data.invitations } };
  } catch (error) {
    if (httpStatusOf(error) === 403) {
      return { ok: false, error: 'You do not have permission to view invitations' };
    }
    return { ok: false, error: httpFailureMessage(error) || 'Failed to list invitations' };
  }
};

/**
 * Revoke a pending invitation.
 */
export const revokeInvitation = async (
  invitationId: string
): Promise<ApiResponse<void>> => {
  try {
    await settingsClient.revokeInvitation({ invitationId });
    return { ok: true, data: undefined };
  } catch (error) {
    if (httpStatusOf(error) === 403) {
      return { ok: false, error: 'You do not have permission to revoke this invitation' };
    }
    return {
      ok: false,
      error:
        httpFailureMessage(error) ||
        (httpStatusOf(error) === 404 ? INVITATION_NOT_FOUND_MESSAGE : 'Failed to revoke invitation'),
    };
  }
};
