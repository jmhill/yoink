import type {
  Admin,
  Organization,
  User,
  Token,
  Invitation,
  CreateTokenResult,
  CreateInvitationInput,
} from '../../dsl/index.js';
import { UnauthorizedError, NotFoundError, ValidationError } from '../../dsl/index.js';
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

  async createOrganization(name: string): Promise<Organization> {
    const response = await client.post('/api/admin/organizations', { name });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode !== 201) {
      throw new Error(`Failed to create organization: ${response.body}`);
    }
    return response.json<Organization>();
  },

  async listOrganizations(): Promise<Organization[]> {
    const response = await client.get('/api/admin/organizations');
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    return response.json<{ organizations: Organization[] }>().organizations;
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

  async createUser(organizationId: string, email: string): Promise<User> {
    const response = await client.post(
      `/api/admin/organizations/${organizationId}/users`,
      { email }
    );
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

  async createToken(userId: string, name: string): Promise<CreateTokenResult> {
    // First get the user to find their organizationId
    const userResponse = await client.get(`/api/admin/users/${userId}`);
    if (userResponse.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (userResponse.statusCode === 404) {
      throw new NotFoundError('User', userId);
    }
    const user = userResponse.json<User>();

    // Now create the token using the org-scoped endpoint
    const response = await client.post(
      `/api/admin/organizations/${user.organizationId}/tokens`,
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

  async listTokens(userId: string): Promise<Token[]> {
    // First get the user to find their organizationId
    const userResponse = await client.get(`/api/admin/users/${userId}`);
    if (userResponse.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (userResponse.statusCode === 404) {
      throw new NotFoundError('User', userId);
    }
    const user = userResponse.json<User>();

    // List tokens for the organization and filter by userId
    const response = await client.get(
      `/api/admin/organizations/${user.organizationId}/tokens`
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
});
