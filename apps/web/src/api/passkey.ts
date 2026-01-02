import { startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import type { PasskeyCredentialInfo } from '@yoink/api-contracts';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

const JSON_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
};

/**
 * Fetch passkey registration options from the server.
 */
export const getPasskeyRegistrationOptions = async (): Promise<
  ApiResponse<{ options: PublicKeyCredentialCreationOptionsJSON; challenge: string }>
> => {
  const response = await fetch('/api/auth/passkey/register/options', {
    method: 'POST',
    headers: JSON_HEADERS,
    credentials: 'include',
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.error || 'Failed to get registration options' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Complete passkey registration by sending WebAuthn response to server.
 */
export const verifyPasskeyRegistration = async (options: {
  challenge: string;
  credential: RegistrationResponseJSON;
  credentialName?: string;
}): Promise<ApiResponse<{ credential: PasskeyCredentialInfo }>> => {
  const response = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST',
    headers: JSON_HEADERS,
    credentials: 'include',
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.error || 'Failed to verify registration' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * List all passkey credentials for the current user.
 */
export const listPasskeys = async (): Promise<
  ApiResponse<{ credentials: PasskeyCredentialInfo[] }>
> => {
  const response = await fetch('/api/auth/passkey/credentials', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.error || 'Failed to list passkeys' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Delete a passkey credential by ID.
 */
export const deletePasskey = async (
  credentialId: string
): Promise<ApiResponse<{ message: string }>> => {
  const response = await fetch(`/api/auth/passkey/credentials/${encodeURIComponent(credentialId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.error || 'Failed to delete passkey' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Full passkey registration flow:
 * 1. Get registration options from server
 * 2. Prompt user for WebAuthn registration via browser
 * 3. Send response to server for verification
 */
export const registerPasskey = async (
  deviceName?: string
): Promise<ApiResponse<{ credential: PasskeyCredentialInfo }>> => {
  // Step 1: Get registration options
  const optionsResult = await getPasskeyRegistrationOptions();
  if (!optionsResult.ok) {
    return optionsResult;
  }

  // Step 2: Start WebAuthn registration (browser prompt)
  let credential: RegistrationResponseJSON;
  try {
    credential = await startRegistration({
      optionsJSON: optionsResult.data.options,
    });
  } catch (err) {
    // User cancelled or device doesn't support WebAuthn
    const message = err instanceof Error ? err.message : 'WebAuthn registration failed';
    return { ok: false, error: message };
  }

  // Step 3: Verify with server
  return verifyPasskeyRegistration({
    challenge: optionsResult.data.challenge,
    credential,
    credentialName: deviceName,
  });
};

/**
 * Generate a simple device name suggestion based on user agent.
 * Returns something like "Chrome on macOS" or "Safari on iPhone".
 */
export const suggestDeviceName = (): string => {
  const ua = navigator.userAgent;

  // Detect browser
  let browser = 'Browser';
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    browser = 'Chrome';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    browser = 'Safari';
  } else if (ua.includes('Firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('Edg')) {
    browser = 'Edge';
  }

  // Detect platform
  let platform = '';
  if (ua.includes('iPhone')) {
    platform = 'iPhone';
  } else if (ua.includes('iPad')) {
    platform = 'iPad';
  } else if (ua.includes('Android')) {
    platform = 'Android';
  } else if (ua.includes('Mac OS')) {
    platform = 'macOS';
  } else if (ua.includes('Windows')) {
    platform = 'Windows';
  } else if (ua.includes('Linux')) {
    platform = 'Linux';
  }

  return platform ? `${browser} on ${platform}` : browser;
};
