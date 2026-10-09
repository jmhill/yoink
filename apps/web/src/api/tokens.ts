import type { TokenInfo, CreateUserTokenResponse, ListUserTokensResponse } from '@yoink/api-contracts';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export const listTokens = async (): Promise<ApiResponse<ListUserTokensResponse>> => {
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

export const renameToken = async (
  tokenId: string,
  name: string
): Promise<ApiResponse<TokenInfo>> => {
  const response = await fetch(`/api/auth/tokens/${encodeURIComponent(tokenId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.message || 'Failed to rename token' };
  }

  const data = await response.json();
  return { ok: true, data };
};

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
