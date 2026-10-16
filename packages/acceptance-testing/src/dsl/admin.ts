import type {
  Organization,
  User,
  Token,
  Invitation,
  CreateTokenResult,
  CreateInvitationInput,
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
  renameOrganization(id: string, newName: string): Promise<Organization>;

  // User management
  createUser(
    organizationId: string,
    email: string,
    options?: { role?: 'admin' | 'member'; kind?: 'human' | 'agent'; name?: string }
  ): Promise<User>;
  listUsers(organizationId: string): Promise<User[]>;
  getUser(id: string): Promise<User>;
  setOrganizationOwner(organizationId: string, userId: string): Promise<User>;
  changeMemberRole(
    organizationId: string,
    userId: string,
    role: 'admin' | 'member'
  ): Promise<User>;
  updateUser(id: string, options: { name: string }): Promise<User>;
  updateProjectCreatedAt(id: string, createdAt: string): Promise<{ id: string; createdAt: string }>;

  // Token management
  createToken(organizationId: string, userId: string, name: string): Promise<CreateTokenResult>;
  listTokens(organizationId: string, userId: string): Promise<Token[]>;
  revokeToken(tokenId: string): Promise<void>;

  // Invitation management
  createInvitation(organizationId: string, input?: CreateInvitationInput): Promise<Invitation>;

  /**
   * Admin-panel UI. Playwright only — HTTP throws UnsupportedOperationError.
   */
  openOrganization(organizationId: string): Promise<void>;
  makeOwner(userId: string): Promise<void>;
  makeAdmin(userId: string): Promise<void>;
  shouldSeeMemberRole(userId: string, role: string): Promise<void>;
  shouldSeeMemberError(userId: string, pattern: string | RegExp): Promise<void>;
  shouldNotSeeMakeAdmin(userId: string): Promise<void>;
  shouldNotSeeMakeOwner(userId: string): Promise<void>;
  revealMember(userId: string): Promise<void>;
  useMobileViewport(): Promise<void>;
  useDesktopViewport(): Promise<void>;
  saveWalkthroughScreenshot(input: { story: string; step: string }): Promise<void>;
};
