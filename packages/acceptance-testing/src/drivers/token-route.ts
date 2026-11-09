import type { TokenRouteCall } from '../dsl/index.js';

export type CompiledTokenRoute = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  payload?: Record<string, unknown>;
};

/** Paths for the frozen list and the session-only token writes. */
export const compileTokenRoute = (
  input: TokenRouteCall,
  organizationId: string
): CompiledTokenRoute => {
  const prefix = input.surface === 'v1' ? '/api/v1' : '/api';
  switch (input.action) {
    case 'list':
      return { method: 'GET', path: `${prefix}/auth/tokens` };
    case 'create':
      return {
        method: 'POST',
        path: `${prefix}/auth/tokens`,
        payload: { name: input.name ?? '' },
      };
    case 'revoke':
      return { method: 'DELETE', path: `${prefix}/auth/tokens/${input.tokenId ?? ''}` };
    case 'reissue':
      return {
        method: 'POST',
        path: `${prefix}/organizations/${organizationId}/members/${input.memberUserId ?? ''}/token`,
        payload: {},
      };
    default: {
      const unreachable: never = input.action;
      return unreachable;
    }
  }
};

export const parseResponseBody = (text: string): unknown => {
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};
