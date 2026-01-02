import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialCreationOptionsJSON,
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import type { SignupOptionsResponse, SignupVerifyResponse } from '@yoink/api-contracts';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

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

/**
 * Leave an organization.
 * Returns specific error messages for personal org and last admin cases.
 */
export const leaveOrganization = async (
  organizationId: string
): Promise<ApiResponse<{ success: true }>> => {
  const response = await fetch(`/api/organizations/${organizationId}/leave`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 404) {
      return { ok: false, error: 'Not a member of this organization' };
    }
    if (response.status === 400) {
      return { ok: false, error: body.message || 'Cannot leave this organization' };
    }
    return { ok: false, error: body.message || 'Failed to leave organization' };
  }

  return { ok: true, data: { success: true } };
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
  code: string
): Promise<
  ApiResponse<{
    id: string;
    organizationId: string;
    organizationName: string;
    email: string | null;
    role: 'admin' | 'member';
    expiresAt: string;
  }>
> => {
  const response = await fetch('/api/invitations/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 404) {
      return { ok: false, error: 'Invitation not found' };
    }
    if (response.status === 410) {
      return { ok: false, error: 'Invitation has expired or already been used' };
    }
    return { ok: false, error: body.message || 'Invalid invitation' };
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
    if (response.status === 409) {
      return { ok: false, error: 'An account with this email already exists' };
    }
    if (response.status === 404) {
      return { ok: false, error: 'Invitation not found' };
    }
    if (response.status === 410) {
      return { ok: false, error: 'Invitation has expired or already been used' };
    }
    return { ok: false, error: body.message || 'Failed to get signup options' };
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
    if (response.status === 409) {
      return { ok: false, error: 'An account with this email already exists' };
    }
    return { ok: false, error: body.message || 'Signup failed' };
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
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
};

/**
 * List members of the current organization.
 */
export const listMembers = async (
  organizationId: string
): Promise<ApiResponse<{ members: Member[] }>> => {
  const response = await fetch(`/api/organizations/${organizationId}/members`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.message || 'Failed to list members' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Remove a member from the current organization.
 */
export const removeMember = async (
  organizationId: string,
  userId: string
): Promise<ApiResponse<void>> => {
  const response = await fetch(`/api/organizations/${organizationId}/members/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 403) {
      return { ok: false, error: body.message || 'Insufficient permissions' };
    }
    if (response.status === 400) {
      return { ok: false, error: body.message || 'Cannot remove this member' };
    }
    return { ok: false, error: body.message || 'Failed to remove member' };
  }

  return { ok: true, data: undefined };
};

// ============================================================================
// Invitation Management
// ============================================================================

export type Invitation = {
  id: string;
  code: string;
  email: string | null;
  organizationId: string;
  role: 'admin' | 'member';
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
  const response = await fetch('/api/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      organizationId,
      role: options.role ?? 'member',
      email: options.email,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 403) {
      return { ok: false, error: 'You do not have permission to create invitations' };
    }
    return { ok: false, error: body.message || 'Failed to create invitation' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * List pending invitations for the current organization.
 */
export const listPendingInvitations = async (
  organizationId: string
): Promise<ApiResponse<{ invitations: Invitation[] }>> => {
  const response = await fetch(`/api/organizations/${organizationId}/invitations`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 403) {
      return { ok: false, error: 'You do not have permission to view invitations' };
    }
    return { ok: false, error: body.message || 'Failed to list invitations' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Revoke a pending invitation.
 */
export const revokeInvitation = async (
  invitationId: string
): Promise<ApiResponse<void>> => {
  const response = await fetch(`/api/invitations/${invitationId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 403) {
      return { ok: false, error: 'You do not have permission to revoke this invitation' };
    }
    if (response.status === 404) {
      return { ok: false, error: 'Invitation not found' };
    }
    return { ok: false, error: body.message || 'Failed to revoke invitation' };
  }

  return { ok: true, data: undefined };
};
