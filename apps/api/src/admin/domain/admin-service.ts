import type { Clock, IdGenerator, PasswordHasher } from '@yoink/infrastructure';
import type { Organization } from '../../auth/domain/organization.js';
import type { User } from '../../auth/domain/user.js';
import type { ApiToken } from '../../auth/domain/api-token.js';
import type { OrganizationStore } from '../../auth/domain/organization-store.js';
import type { UserStore } from '../../auth/domain/user-store.js';
import type { TokenStore } from '../../auth/domain/token-store.js';

export type AdminServiceDependencies = {
  organizationStore: OrganizationStore;
  userStore: UserStore;
  tokenStore: TokenStore;
  clock: Clock;
  idGenerator: IdGenerator;
  passwordHasher: PasswordHasher;
};

export type CreateTokenResult = {
  token: ApiTokenView; // View without hash, not full ApiToken
  rawToken: string; // The full tokenId:secret value
};

// API token without the hash (for external API responses)
export type ApiTokenView = Omit<ApiToken, 'tokenHash'>;

export type AdminService = {
  // Organizations
  listOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | null>;
  createOrganization(name: string): Promise<Organization>;

  // Users
  listUsers(organizationId: string): Promise<User[]>;
  getUser(id: string): Promise<User | null>;
  createUser(organizationId: string, email: string): Promise<User>;

  // Tokens
  listTokens(userId: string): Promise<ApiTokenView[]>;
  createToken(userId: string, name: string): Promise<CreateTokenResult>;
  revokeToken(id: string): Promise<void>;
};

const toApiTokenView = (token: ApiToken): ApiTokenView => {
  const { tokenHash: _hash, ...view } = token;
  return view;
};

export const createAdminService = (
  deps: AdminServiceDependencies
): AdminService => {
  const {
    organizationStore,
    userStore,
    tokenStore,
    clock,
    idGenerator,
    passwordHasher,
  } = deps;

  return {
    // Organizations
    async listOrganizations() {
      return organizationStore.findAll();
    },

    async getOrganization(id: string) {
      return organizationStore.findById(id);
    },

    async createOrganization(name: string) {
      const organization: Organization = {
        id: idGenerator.generate(),
        name,
        createdAt: clock.now().toISOString(),
      };

      await organizationStore.save(organization);
      return organization;
    },

    // Users
    async listUsers(organizationId: string) {
      return userStore.findByOrganizationId(organizationId);
    },

    async getUser(id: string) {
      return userStore.findById(id);
    },

    async createUser(organizationId: string, email: string) {
      const user: User = {
        id: idGenerator.generate(),
        organizationId,
        email,
        createdAt: clock.now().toISOString(),
      };

      await userStore.save(user);
      return user;
    },

    // Tokens
    async listTokens(userId: string) {
      const tokens = await tokenStore.findByUserId(userId);
      return tokens.map(toApiTokenView);
    },

    async createToken(userId: string, name: string) {
      const tokenId = idGenerator.generate();
      const secret = idGenerator.generate(); // Use UUID as secret for sufficient entropy
      const tokenHash = await passwordHasher.hash(secret);

      const token: ApiToken = {
        id: tokenId,
        userId,
        tokenHash,
        name,
        createdAt: clock.now().toISOString(),
      };

      await tokenStore.save(token);

      return {
        token: toApiTokenView(token),
        rawToken: `${tokenId}:${secret}`,
      };
    },

    async revokeToken(id: string) {
      await tokenStore.delete(id);
    },
  };
};
