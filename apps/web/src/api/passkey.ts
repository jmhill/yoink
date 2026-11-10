import { startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import type { PasskeyCredentialInfo } from '@yoink/api-contracts';
import { authWebClient, httpFailureMessage } from '@/api/client';
import { tokenStorage } from '@/lib/token';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Fetch passkey registration options from the server.
 * The web client still sends a stored bearer token until PLAN 7.7c.
 */
export const getPasskeyRegistrationOptions = async (): Promise<
  ApiResponse<{ options: PublicKeyCredentialCreationOptionsJSON; challenge: string }>
> => {
  try {
    const data = await authWebClient.registerPasskeyOptions({});
    return {
      ok: true,
      data: {
        options: data.options as PublicKeyCredentialCreationOptionsJSON,
        challenge: data.challenge,
      },
    };
  } catch (error) {
    return { ok: false, error: httpFailureMessage(error) || 'Failed to get registration options' };
  }
};

/**
 * Complete passkey registration by sending WebAuthn response to server.
 */
export const verifyPasskeyRegistration = async (options: {
  challenge: string;
  credential: RegistrationResponseJSON;
  credentialName?: string;
}): Promise<ApiResponse<{ credential: PasskeyCredentialInfo }>> => {
  try {
    const data = await authWebClient.registerPasskey(options);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: httpFailureMessage(error) || 'Failed to verify registration' };
  }
};

/**
 * List all passkey credentials for the current user.
 */
export const listPasskeys = async (): Promise<
  ApiResponse<{ credentials: PasskeyCredentialInfo[] }>
> => {
  try {
    const data = await authWebClient.listPasskeys();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: httpFailureMessage(error) || 'Failed to list passkeys' };
  }
};

/**
 * Delete a passkey credential by ID.
 */
export const deletePasskey = async (
  credentialId: string
): Promise<ApiResponse<{ message: string }>> => {
  try {
    const data = await authWebClient.deletePasskey({ credentialId });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: httpFailureMessage(error) || 'Failed to delete passkey' };
  }
};

/**
 * Full passkey registration flow:
 * 1. Get registration options from server
 * 2. Prompt user for WebAuthn registration via browser
 * 3. Send response to server for verification
 * 4. Clear localStorage token (user is now session-authenticated)
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
  const result = await verifyPasskeyRegistration({
    challenge: optionsResult.data.challenge,
    credential,
    credentialName: deviceName,
  });

  // Step 4: Clear token on success - user is now session-authenticated
  if (result.ok) {
    tokenStorage.remove();
  }

  return result;
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
