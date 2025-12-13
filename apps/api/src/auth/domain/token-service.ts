import type { Clock, PasswordHasher } from '@yoink/infrastructure';
import type { Organization } from './organization.js';
import type { User } from './user.js';
import type { ApiToken } from './api-token.js';
import type { OrganizationStore } from './organization-store.js';
import type { UserStore } from './user-store.js';
import type { TokenStore } from './token-store.js';

export type AuthResult = {
  organization: Organization;
  user: User;
  token: ApiToken;
};

export type TokenService = {
  validateToken(plaintext: string): Promise<AuthResult | null>;
};

export type TokenServiceDependencies = {
  organizationStore: OrganizationStore;
  userStore: UserStore;
  tokenStore: TokenStore;
  passwordHasher: PasswordHasher;
  clock: Clock;
};

type ParsedToken = {
  tokenId: string;
  secret: string;
};

const parseToken = (token: string): ParsedToken | null => {
  const colonIndex = token.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }

  const tokenId = token.slice(0, colonIndex);
  const secret = token.slice(colonIndex + 1);

  if (tokenId.length === 0 || secret.length === 0) {
    return null;
  }

  return { tokenId, secret };
};

export const createTokenService = (
  deps: TokenServiceDependencies
): TokenService => {
  const { organizationStore, userStore, tokenStore, passwordHasher, clock } = deps;

  return {
    validateToken: async (plaintext: string): Promise<AuthResult | null> => {
      // Parse tokenId:secret format
      const parsed = parseToken(plaintext);
      if (!parsed) {
        return null;
      }

      // Lookup token by ID (O(1))
      const token = await tokenStore.findById(parsed.tokenId);
      if (!token) {
        return null;
      }

      // Verify secret against stored hash
      const isMatch = await passwordHasher.compare(parsed.secret, token.tokenHash);
      if (!isMatch) {
        return null;
      }

      const user = await userStore.findById(token.userId);
      if (!user) {
        return null;
      }

      const organization = await organizationStore.findById(user.organizationId);
      if (!organization) {
        return null;
      }

      // Update lastUsedAt
      await tokenStore.updateLastUsed(token.id, clock.now().toISOString());

      return { organization, user, token };
    },
  };
};
