import type {
  Admin,
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
} from '../../dsl/index.js';
import {
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  UnsupportedOperationError,
} from '../../dsl/index.js';
import type { HttpClient } from './http-client.js';

/**
 * HTTP implementation of the Admin interface.
 */
export const createHttpAdmin = (
  client: HttpClient,
  password: string
): Admin => ({
  async login(): Promise<void> {
    const response = await client.post('/api/admin/login', { password });
    if (response.statusCode === 401) {
      throw new UnauthorizedError('Invalid admin password');
    }
    if (response.statusCode !== 200) {
      throw new Error(`Admin login failed: ${response.body}`);
    }
  },

  async logout(): Promise<void> {
    await client.post('/api/admin/logout', {});
  },

  async isLoggedIn(): Promise<boolean> {
    const response = await client.get('/api/admin/session');
    if (response.statusCode === 401) {
      return false;
    }
    const body = response.json<{ authenticated: boolean }>();
    return body.authenticated;
  },

  async createOrganization(
    name: string,
    options?: { ownerEmail?: string }
  ): Promise<Organization> {
    const ownerEmail =
      options?.ownerEmail ??
      `unused-owner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.invalid`;
    const response = await client.post('/api/admin/organizations', { name, ownerEmail });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode !== 201) {
      throw new Error(`Failed to create organization: ${response.body}`);
    }
    return response.json<{ organization: Organization }>().organization;
  },

  async issueOwnerInvitation(
    organizationId: string,
    email: string
  ): Promise<IssueOwnerInvitationResult> {
    const response = await client.post(
      `/api/admin/organizations/${organizationId}/owner-invitation`,
      { email }
    );
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Organization', organizationId);
    }
    if (response.statusCode === 400 || response.statusCode === 409) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    if (response.statusCode !== 201) {
      throw new Error(`Failed to issue owner invitation: ${response.body}`);
    }
    return response.json<IssueOwnerInvitationResult>();
  },

  async getOwnerInvitation(organizationId: string): Promise<OwnerInvitation | null> {
    const response = await client.get(
      `/api/admin/organizations/${organizationId}/owner-invitation`
    );
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Organization', organizationId);
    }
    if (response.statusCode !== 200) {
      throw new Error(`Failed to get owner invitation: ${response.body}`);
    }
    return response.json<{ ownerInvitation: OwnerInvitation | null }>().ownerInvitation;
  },

  async getOwnerInvitationDetails(organizationId: string): Promise<OwnerInvitationDetails> {
    const response = await client.get(
      `/api/admin/organizations/${organizationId}/owner-invitation`
    );
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Organization', organizationId);
    }
    if (response.statusCode !== 200) {
      throw new Error(`Failed to get owner invitation: ${response.body}`);
    }
    return response.json<OwnerInvitationDetails>();
  },

  async createOwnerlessWorkspace(
    name: string,
    options?: { personalUserId?: string }
  ): Promise<Organization> {
    const response = await client.post('/api/test/ownerless-workspace', {
      name,
      ...(options?.personalUserId ? { personalUserId: options.personalUserId } : {}),
    });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode !== 201) {
      throw new Error(`Failed to create ownerless workspace: ${response.body}`);
    }
    return response.json<{ organization: Organization }>().organization;
  },

  async expireInvitation(code: string): Promise<void> {
    const response = await client.post('/api/test/expire-invitation', { code });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Invitation', code);
    }
    if (response.statusCode !== 204) {
      throw new Error(`Failed to expire invitation: ${response.body}`);
    }
  },

  async assignOwnerKeepingInvite(organizationId: string, userId: string): Promise<void> {
    const response = await client.post('/api/test/assign-owner-keeping-invite', {
      organizationId,
      userId,
    });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode !== 204) {
      throw new Error(`Failed to assign owner keeping invite: ${response.body}`);
    }
  },

  async listOrganizations(): Promise<WorkspaceListItem[]> {
    const response = await client.get('/api/admin/organizations');
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    return response.json<{ organizations: WorkspaceListItem[] }>().organizations;
  },

  async getOrganization(id: string): Promise<Organization> {
    const response = await client.get(`/api/admin/organizations/${id}`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Organization', id);
    }
    return response.json<Organization>();
  },

  async renameOrganization(id: string, newName: string): Promise<Organization> {
    const response = await client.patch(`/api/admin/organizations/${id}`, {
      name: newName,
    });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Organization', id);
    }
    if (response.statusCode !== 200) {
      throw new Error(`Failed to rename organization: ${response.body}`);
    }
    return response.json<Organization>();
  },

  async createUser(
    organizationId: string,
    email: string,
    options?: { role?: 'admin' | 'member'; kind?: 'human' | 'agent'; name?: string }
  ): Promise<User> {
    const response = await client.post(`/api/admin/organizations/${organizationId}/users`, {
      email,
      ...(options?.role !== undefined ? { role: options.role } : {}),
      ...(options?.kind !== undefined ? { kind: options.kind } : {}),
      ...(options?.name !== undefined ? { name: options.name } : {}),
    });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 400) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    if (response.statusCode !== 201) {
      throw new Error(`Failed to create user: ${response.body}`);
    }
    return response.json<User>();
  },

  async listUsers(organizationId: string): Promise<User[]> {
    const response = await client.get(
      `/api/admin/organizations/${organizationId}/users`
    );
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    return response.json<{ users: User[] }>().users;
  },

  async setOrganizationOwner(organizationId: string, userId: string): Promise<User> {
    const response = await client.put(`/api/admin/organizations/${organizationId}/owner`, {
      userId,
    });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('User', userId);
    }
    if (response.statusCode === 400 || response.statusCode === 409) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    if (response.statusCode !== 200) {
      throw new Error(`Failed to set owner: ${response.body}`);
    }
    return response.json<User>();
  },

  async changeMemberRole(
    organizationId: string,
    userId: string,
    role: 'admin' | 'member'
  ): Promise<User> {
    const response = await client.patch(
      `/api/admin/organizations/${organizationId}/members/${userId}`,
      { role }
    );
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('User', userId);
    }
    if (response.statusCode === 400 || response.statusCode === 409) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    if (response.statusCode !== 200) {
      throw new Error(`Failed to change member role: ${response.body}`);
    }
    return response.json<User>();
  },

  async getUser(id: string): Promise<User> {
    const response = await client.get(`/api/admin/users/${id}`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('User', id);
    }
    return response.json<User>();
  },

  async updateUser(id: string, options: { name: string }): Promise<User> {
    const response = await client.patch(`/api/admin/users/${id}`, { name: options.name });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('User', id);
    }
    if (response.statusCode !== 200) {
      throw new Error(`Failed to update user: ${response.body}`);
    }
    return response.json<User>();
  },

  async updateProjectCreatedAt(
    id: string,
    createdAt: string
  ): Promise<{ id: string; createdAt: string }> {
    const response = await client.patch(`/api/admin/projects/${id}`, { createdAt });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Project', id);
    }
    if (response.statusCode !== 200) {
      throw new Error(`Failed to back-date project: ${response.body}`);
    }
    return response.json<{ id: string; createdAt: string }>();
  },

  async createToken(organizationId: string, userId: string, name: string): Promise<CreateTokenResult> {
    const response = await client.post(
      `/api/admin/organizations/${organizationId}/tokens`,
      { userId, name }
    );
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode !== 201) {
      throw new Error(`Failed to create token: ${response.body}`);
    }
    const result = response.json<{ token: Token; rawToken: string }>();
    return { token: result.token, rawToken: result.rawToken };
  },

  async listTokens(organizationId: string, userId: string): Promise<Token[]> {
    const response = await client.get(
      `/api/admin/organizations/${organizationId}/tokens`
    );
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    const allTokens = response.json<{ tokens: Token[] }>().tokens;
    // Filter to only this user's tokens
    return allTokens.filter(token => token.userId === userId);
  },

  async revokeToken(tokenId: string): Promise<void> {
    const response = await client.delete(`/api/admin/tokens/${tokenId}`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode !== 204) {
      throw new Error(`Failed to revoke token: ${response.body}`);
    }
  },

  async createInvitation(organizationId: string, input?: CreateInvitationInput): Promise<Invitation> {
    const response = await client.post(
      `/api/admin/organizations/${organizationId}/invitations`,
      {
        role: input?.role ?? 'member',
        email: input?.email,
        expiresInDays: input?.expiresInDays,
      }
    );
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Organization', organizationId);
    }
    if (response.statusCode === 400) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    if (response.statusCode !== 201) {
      throw new Error(`Failed to create invitation: ${response.body}`);
    }
    return response.json<Invitation>();
  },

  async openOrganization() {
    throw new UnsupportedOperationError('openOrganization', 'http');
  },
  async openOrganizationsList() {
    throw new UnsupportedOperationError('openOrganizationsList', 'http');
  },
  async shouldSeeOwnerBadge() {
    throw new UnsupportedOperationError('shouldSeeOwnerBadge', 'http');
  },
  async shouldSeeNoOwnerBadge() {
    throw new UnsupportedOperationError('shouldSeeNoOwnerBadge', 'http');
  },
  async clickOwnerBadge() {
    throw new UnsupportedOperationError('clickOwnerBadge', 'http');
  },
  async shouldSeeExpiredOwnerInvite() {
    throw new UnsupportedOperationError('shouldSeeExpiredOwnerInvite', 'http');
  },
  async shouldSeeOwnerInviteEmailPrefilled() {
    throw new UnsupportedOperationError('shouldSeeOwnerInviteEmailPrefilled', 'http');
  },
  async replaceExpiredOwnerInviteEmail() {
    throw new UnsupportedOperationError('replaceExpiredOwnerInviteEmail', 'http');
  },
  async shouldSeeNoCreateOwnerInvite() {
    throw new UnsupportedOperationError('shouldSeeNoCreateOwnerInvite', 'http');
  },
  async frameOrganizationRow() {
    throw new UnsupportedOperationError('frameOrganizationRow', 'http');
  },
  async frameOwnerSection() {
    throw new UnsupportedOperationError('frameOwnerSection', 'http');
  },

  async frameOwnerAndUsers(): Promise<void> {
    throw new UnsupportedOperationError('frameOwnerAndUsers', 'http');
  },
  async makeOwner() {
    throw new UnsupportedOperationError('makeOwner', 'http');
  },
  async makeAdmin() {
    throw new UnsupportedOperationError('makeAdmin', 'http');
  },
  async shouldSeeMemberRole() {
    throw new UnsupportedOperationError('shouldSeeMemberRole', 'http');
  },
  async shouldSeeMemberError() {
    throw new UnsupportedOperationError('shouldSeeMemberError', 'http');
  },
  async shouldNotSeeMakeAdmin() {
    throw new UnsupportedOperationError('shouldNotSeeMakeAdmin', 'http');
  },
  async shouldNotSeeMakeOwner() {
    throw new UnsupportedOperationError('shouldNotSeeMakeOwner', 'http');
  },
  async shouldSeeMakeOwner() {
    throw new UnsupportedOperationError('shouldSeeMakeOwner', 'http');
  },
  async shouldNotSeeNamedUser() {
    throw new UnsupportedOperationError('shouldNotSeeNamedUser', 'http');
  },
  async openCreateUser() {
    throw new UnsupportedOperationError('openCreateUser', 'http');
  },
  async submitCreateUser() {
    throw new UnsupportedOperationError('submitCreateUser', 'http');
  },
  async shouldSeeCreateUserError() {
    throw new UnsupportedOperationError('shouldSeeCreateUserError', 'http');
  },
  async revealMember() {
    throw new UnsupportedOperationError('revealMember', 'http');
  },
  async frameMember() {
    throw new UnsupportedOperationError('frameMember', 'http');
  },
  async useMobileViewport() {
    throw new UnsupportedOperationError('useMobileViewport', 'http');
  },
  async useDesktopViewport() {
    throw new UnsupportedOperationError('useDesktopViewport', 'http');
  },
  async saveWalkthroughScreenshot() {
    throw new UnsupportedOperationError('saveWalkthroughScreenshot', 'http');
  },
  async openCreateWorkspace() {
    throw new UnsupportedOperationError('openCreateWorkspace', 'http');
  },
  async fillCreateWorkspace() {
    throw new UnsupportedOperationError('fillCreateWorkspace', 'http');
  },
  async submitCreateWorkspace() {
    throw new UnsupportedOperationError('submitCreateWorkspace', 'http');
  },
  async shouldSeeOwnerAssignedToast() {
    throw new UnsupportedOperationError('shouldSeeOwnerAssignedToast', 'http');
  },
  async shouldSeeOwnerInviteCreated() {
    throw new UnsupportedOperationError('shouldSeeOwnerInviteCreated', 'http');
  },
  async copyOwnerInviteLink() {
    throw new UnsupportedOperationError('copyOwnerInviteLink', 'http');
  },
  async closeOwnerInviteDialog() {
    throw new UnsupportedOperationError('closeOwnerInviteDialog', 'http');
  },
  async shouldSeeOwner() {
    throw new UnsupportedOperationError('shouldSeeOwner', 'http');
  },
  async shouldSeePendingOwnerInvite() {
    throw new UnsupportedOperationError('shouldSeePendingOwnerInvite', 'http');
  },
  async clickNewOwnerLink() {
    throw new UnsupportedOperationError('clickNewOwnerLink', 'http');
  },
  async confirmNewOwnerLink() {
    throw new UnsupportedOperationError('confirmNewOwnerLink', 'http');
  },
  async clickUseDifferentEmail() {
    throw new UnsupportedOperationError('clickUseDifferentEmail', 'http');
  },
  async submitDifferentOwnerEmail() {
    throw new UnsupportedOperationError('submitDifferentOwnerEmail', 'http');
  },
  async clickCreateOwnerInvite() {
    throw new UnsupportedOperationError('clickCreateOwnerInvite', 'http');
  },
  async submitCreateOwnerInvite() {
    throw new UnsupportedOperationError('submitCreateOwnerInvite', 'http');
  },
  async openUnsignedSignup() {
    throw new UnsupportedOperationError('openUnsignedSignup', 'http');
  },
  async fillUnsignedSignupEmail() {
    throw new UnsupportedOperationError('fillUnsignedSignupEmail', 'http');
  },
  async submitUnsignedSignup() {
    throw new UnsupportedOperationError('submitUnsignedSignup', 'http');
  },
  async shouldSeeUnsignedSignupText() {
    throw new UnsupportedOperationError('shouldSeeUnsignedSignupText', 'http');
  },
  async saveUnsignedWalkthroughScreenshot() {
    throw new UnsupportedOperationError('saveUnsignedWalkthroughScreenshot', 'http');
  },
});
