const TOKEN_KEY = 'yoink_api_token';

/**
 * Manages API token storage in localStorage.
 * 
 * NOTE: This is a backwards-compatibility layer for existing token-authenticated
 * users who haven't yet migrated to passkeys. Once all users have registered
 * passkeys, this can be removed. See docs/PLAN.md Phase 7.7c for removal criteria.
 */
export const tokenStorage = {
  get: (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  },

  isConfigured: (): boolean => {
    const token = localStorage.getItem(TOKEN_KEY);
    return token !== null && token.trim() !== '';
  },

  remove: (): void => {
    localStorage.removeItem(TOKEN_KEY);
  },
};
