import type {
  Organization,
  WorkspaceListItem,
  User,
  Token,
  Invitation,
  OwnerInvitation,
  OwnerInvitationDetails,
  IssueOwnerInvitationResult,
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
  createOrganization(name: string, options?: { ownerEmail?: string }): Promise<Organization>;
  listOrganizations(): Promise<WorkspaceListItem[]>;
  getOrganization(id: string): Promise<Organization>;
  renameOrganization(id: string, newName: string): Promise<Organization>;
  issueOwnerInvitation(
    organizationId: string,
    email: string
  ): Promise<IssueOwnerInvitationResult>;
  getOwnerInvitation(organizationId: string): Promise<OwnerInvitation | null>;
  getOwnerInvitationDetails(organizationId: string): Promise<OwnerInvitationDetails>;
  createOwnerlessWorkspace(
    name: string,
    options?: { personalUserId?: string }
  ): Promise<Organization>;
  expireInvitation(code: string): Promise<void>;
  assignOwnerKeepingInvite(organizationId: string, userId: string): Promise<void>;

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
  openOrganizationsList(): Promise<void>;
  shouldSeeOwnerBadge(orgId: string, kind: 'no-owner' | 'waiting-for-owner'): Promise<void>;
  shouldSeeNoOwnerBadge(orgId: string): Promise<void>;
  clickOwnerBadge(orgId: string): Promise<void>;
  shouldSeeExpiredOwnerInvite(email: string): Promise<void>;
  shouldSeeOwnerInviteEmailPrefilled(email: string): Promise<void>;
  shouldSeeNoCreateOwnerInvite(): Promise<void>;
  frameOrganizationRow(orgId: string): Promise<void>;
  frameOwnerSection(): Promise<void>;
  frameOwnerAndUsers(): Promise<void>;
  makeOwner(userId: string): Promise<void>;
  makeAdmin(userId: string): Promise<void>;
  shouldSeeMemberRole(userId: string, role: string): Promise<void>;
  shouldSeeMemberError(userId: string, pattern: string | RegExp): Promise<void>;
  shouldNotSeeMakeAdmin(userId: string): Promise<void>;
  shouldNotSeeMakeOwner(userId: string): Promise<void>;
  shouldSeeMakeOwner(userId: string): Promise<void>;
  shouldNotSeeNamedUser(name: string): Promise<void>;
  openCreateUser(): Promise<void>;
  submitCreateUser(input: {
    email: string;
    name?: string;
    kind: 'human' | 'agent';
    role: 'member' | 'admin';
  }): Promise<void>;
  shouldSeeCreateUserError(pattern: string | RegExp): Promise<void>;
  revealMember(userId: string): Promise<void>;
  frameMember(userId: string): Promise<void>;
  useMobileViewport(): Promise<void>;
  useDesktopViewport(): Promise<void>;
  saveWalkthroughScreenshot(input: {
    story: string;
    step: string;
    includeToasts?: boolean;
  }): Promise<void>;
  openCreateWorkspace(): Promise<void>;
  fillCreateWorkspace(input: { name: string; ownerEmail: string }): Promise<void>;
  submitCreateWorkspace(): Promise<void>;
  shouldSeeOwnerAssignedToast(name: string, workspace: string): Promise<void>;
  shouldSeeOwnerInviteCreated(email: string): Promise<void>;
  copyOwnerInviteLink(): Promise<void>;
  closeOwnerInviteDialog(): Promise<void>;
  shouldSeeOwner(name: string): Promise<void>;
  shouldSeePendingOwnerInvite(email: string): Promise<void>;
  clickNewOwnerLink(): Promise<void>;
  confirmNewOwnerLink(): Promise<void>;
  clickUseDifferentEmail(): Promise<void>;
  submitDifferentOwnerEmail(email: string): Promise<void>;
  clickCreateOwnerInvite(): Promise<void>;
  submitCreateOwnerInvite(email: string): Promise<void>;
  openUnsignedSignup(code: string): Promise<void>;
  fillUnsignedSignupEmail(email: string): Promise<void>;
  submitUnsignedSignup(): Promise<void>;
  shouldSeeUnsignedSignupText(text: string): Promise<void>;
  saveUnsignedWalkthroughScreenshot(input: {
    story: string;
    step: string;
  }): Promise<void>;
};
