import type { TokenInfo, CreateUserTokenResponse } from '@yoink/api-contracts';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * List all API tokens for the current user in the current organization.
 */
export const listTokens = async (): Promise<ApiResponse<{ tokens: TokenInfo[] }>> => {
  const response = await fetch('/api/auth/tokens', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.message || 'Failed to list tokens' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Create a new API token.
 * Returns the token info and raw token value (only shown once).
 */
export const createToken = async (
  name: string
): Promise<ApiResponse<CreateUserTokenResponse>> => {
  const response = await fetch('/api/auth/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.message || 'Failed to create token' };
  }

  const data = await response.json();
  return { ok: true, data };
};

/**
 * Revoke (delete) an API token.
 */
export const revokeToken = async (
  tokenId: string
): Promise<ApiResponse<{ success: true }>> => {
  const response = await fetch(`/api/auth/tokens/${encodeURIComponent(tokenId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.message || 'Failed to revoke token' };
  }

  const data = await response.json();
  return { ok: true, data };
};
