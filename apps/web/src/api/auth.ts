import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialCreationOptionsJSON,
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import type { SignupOptionsResponse, SignupVerifyResponse } from '@yoink/api-contracts';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Get session info for the current user.
 * Used to check if user is authenticated.
 */
export const getSession = async (): Promise<
  ApiResponse<{ user: { id: string; email: string }; organizationId: string }>
> => {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.error || 'Not authenticated' };
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
    return { ok: false, error: body.error || 'Failed to get login options' };
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
    return { ok: false, error: body.error || 'Login failed' };
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
 * Logout - revoke session and clear cookie.
 */
export const logout = async (): Promise<ApiResponse<{ success: true }>> => {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.error || 'Logout failed' };
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
    return { ok: false, error: body.error || 'Invalid invitation' };
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
    return { ok: false, error: body.error || 'Failed to get signup options' };
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
    return { ok: false, error: body.error || 'Signup failed' };
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
