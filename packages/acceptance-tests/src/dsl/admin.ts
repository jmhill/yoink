import type {
  Organization,
  User,
  Token,
  CreateTokenResult,
} from './types.js';

/**
 * Admin operations for managing tenants.
 * Requires admin authentication (separate from user authentication).
 *
 * This is used for test setup (creating orgs/users/tokens) and for
 * testing admin-specific functionality.
 */
export type Admin = {
  // Authentication
  login(): Promise<void>;
  logout(): Promise<void>;
  isLoggedIn(): Promise<boolean>;

  // Organization management
  createOrganization(name: string): Promise<Organization>;
  listOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization>;

  // User management
  createUser(organizationId: string, email: string): Promise<User>;
  listUsers(organizationId: string): Promise<User[]>;
  getUser(id: string): Promise<User>;

  // Token management
  createToken(userId: string, name: string): Promise<CreateTokenResult>;
  listTokens(userId: string): Promise<Token[]>;
  revokeToken(tokenId: string): Promise<void>;
};
